import {map, MAX_FUTURE} from "../beliefs/map.js";
import {parcels} from "../beliefs/parcels.js";
import {distance, me} from "../beliefs/beliefs.js";
import {agents} from "../beliefs/agents.js";

import {search_path} from "./search_planners.js";
import {PDDL_path} from "./PDDL_planners.js";

import {otherAgent, AgentRole, sendRequest, awaitRequest} from "../coordination/coordination.js";

const MAX_EXPLORE_PATH_LENGTH = 20;
const PROBABILITY_KEEP_BEST_TILE = 0.75;

//TODO: if the parcel is not there anymore remove deviation from the path
/**
 * Searches in a corridor for parcels to pick up
 * @param {[{x: number, y: number, move: string}]} path The plan to soft replan
 * @param {[{x: number, y: number}]} objective The objective to reach - ignored with PDDL
 * @param {boolean} PDDL Use PDDL to find the path
 */
async function beamSearch(path, objective, PDDL = false) {
    // console.log("\t[BEAM SEARCH]\n\tObjective", objective);
    // console.log("\t[BEAM SEARCH]\n\tOriginal path", path);

    let directions = [[0, 0, "pickup"],
        [1, 0, "right"], [-1, 0, "left"],
        [0, 1, "up"], [0, -1, "down"]];
    let move = 0;

    //calculate allowed deviations tiles
    let allowedDeviations = new Array(map.width).fill().map(() => new Array(map.height).fill().map(() => false));
    for (let step of path) {
        for (let dir of directions) {
            let x = step.x + dir[0];
            let y = step.y + dir[1];
            if (x >= 0 && x < map.width && y >= 0 && y < map.height
                && !(map.predictedMap[move][x][y].agent)
                && !(map.predictedMap[move][x][y].type === "obstacle")) {
                allowedDeviations[x][y] = true;
            }
        }
        if (move < (MAX_FUTURE - 1)) move++;
    }
    // console.log("Allowed deviations");
    // for (let i = map.width - 1; i >= 0; i--) {
    //     for (let j = 0; j < map.height; j++) {
    //         process.stdout.write(allowedDeviations[j][i] ? "1 " : "0 ");
    //     }
    //     console.log();
    // }


    move = 0;
    for (let stepNum = 0; stepNum < path.length; stepNum++) {
        let step = path[stepNum]
        if (step.move === "pickup") continue;

        //check if there are any packages on the way or in the vicinity
        for (let dir of directions) {
            let x = step.x + dir[0];
            let y = step.y + dir[1];
            if (x >= 0 && x < map.width && y >= 0 && y < map.height
                && (allowedDeviations[x][y] || dir[2] === "pickup") // only allow deviations if they are in the allowed deviations list
                && (!path.some((p) => p.x === x && p.y === y) || dir[2] === "pickup") // don't go back to the same tile
                && !path.some((p) => p.x === x && p.y === y && p.move === "pickup") // don't pick up the same package twice
            ) {
                allowedDeviations[x][y] = false;
                //console.log("\texploring deviation at", x, y);
                if (map.map[x][y].parcel && !map.map[x][y].agent) {
                    let parcel = parcels.get(map.map[x][y].parcel.id);
                    if (parcel && !parcel.carried) {
                        //console.log("\t\tfound a package at", x, y);

                        //add a deviation to the path
                        let deviation = [{x: x, y: y, move: dir[2]}];
                        let newPath;
                        if (dir[2] === "pickup") {
                            // console.log("\t\tcollecting package at", x, y);
                            // newPath = path.slice(stepNum + 1);
                            newPath = path.slice(stepNum + 1)
                        } else {
                            if (!PDDL) {
                                newPath = search_path({x: x, y: y}, objective, move);
                            } else {
                                //get back to the original path
                                let goBackMove = {x: step.x, y: step.y, move: "none"};
                                if (dir[2] === "right") goBackMove.move = "left";
                                if (dir[2] === "left") goBackMove.move = "right";
                                if (dir[2] === "up") goBackMove.move = "down";
                                if (dir[2] === "down") goBackMove.move = "up";
                                newPath = [goBackMove].concat(path.slice(stepNum + 1));
                            }
                            if (move < (MAX_FUTURE - 1)) move++;
                        }
                        path = path.slice(0, stepNum + 1)
                            .concat(deviation)
                            .concat(newPath);
                        // console.log("\t\t[BEAM SEARCH] deviation added to the path", deviation);
                        break;
                    }
                }
            }
        }
        if (move < (MAX_FUTURE - 1)) move++;
    }

    // console.log("[BEAM SEARCH] Final path", path);
    return path;
}


/**
 * Beam search to find the path to the closest objective
 *
 * @param {{x: number, y: number}} pos The starting position
 * @param {[{x: number, y: number}]} objective The objective to reach
 * @param {number} deviations The number of allowed deviations from the path
 * @param {boolean} fallback If the search should fallback to BFS if the objective is unreachable
 * @param {boolean} PDDL If the search should use PDDL or not
 * @returns {[{x: number, y: number, move: string}]} The path to the objective
 */
async function beamPackageSearch(pos, objective, PDDL = false, fallback = true) {
    //use BFS to create a path to the objective, then allow for slight deviations to gather other packages on the way
    if (!(objective instanceof Array)) objective = [objective];
    let path = []
    if (PDDL) {
        path = await PDDL_path(pos, objective, fallback);
    } else {
        path = search_path(pos, objective, fallback);
    }

    path = await beamSearch(path, objective, PDDL);

    return path;
}

/**
 * BFS to find the path to the closest delivery zone and deliver the package
 *
 * @param {{x: number, y: number}} pos The starting position
 * @param {[{x: number, y: number}]} objectiveList (for compatibility with other planners - not used)
 * @param {boolean} usePDDL If the search should use PDDL or not
 * @returns {[{x: number, y: number, move: string}]} The path to the objective
 */
async function deliveryBFS(pos, objectiveList, usePDDL = false) {
    let list = await beamPackageSearch(pos, map.deliveryZones, usePDDL);
    let last_move = list.at(-1);
    if (!last_move) last_move = pos;
    // Add a move to the last position to deliver the package
    list.push({x: last_move.x, y: last_move.y, move: "deliver"});

    return list;
}

/**
 * Hill climbing for exploring unknown areas
 *
 * @param {{x: number, y: number}} pos - The starting position
 * @param {*} goal The goal to reach, not used, just here for parameter expansion
 *
 * @returns {[{x: number, y: number, move: string}]} The explore path
 */
function exploreBFS(pos, goal, usePDDL = false) {
    // Select goal based on the last sensed time of the tile
    // map.map.sort((a, b) => (a.last_seen - b.last_seen));
    // let goal = map.map[0][0];
    // console.log("Exploring goal", goal,map.map[19][19]);
    let path = [];
    let directions = [[0, 1, 'up'], [0, -1, 'down'], [1, 0, 'right'], [-1, 0, 'left']];
    let path_length = 0;
    let oldest_last_seen = Infinity;
    let visited = new Map();
    let selected_move = null;
    let key = "";
    let heuristic = Math.max(me.config.PARCELS_OBSERVATION_DISTANCE - 3, 1);
    if (pos.x <= (heuristic + 2) || pos.x >= (map.width - heuristic - 2) || pos.y <= (heuristic + 2) || pos.y >= (map.height - heuristic - 2)) {
        heuristic = 0;
    }
    while (path_length < MAX_EXPLORE_PATH_LENGTH) {
        //console.log("Exploring", pos);
        for (let dir of directions) {
            let newX = pos.x + dir[0];
            let newY = pos.y + dir[1];
            key = newX + "_" + newY;
            //console.log("visited", visited.has(key), key);
            if ((newX >= heuristic) && (newX < (map.width - heuristic)) && (newY >= heuristic) && (newY < (map.height - heuristic))
                && map.map[newX][newY].last_seen < oldest_last_seen && (!visited.has(key))
                && map.map[newX][newY].type !== 'obstacle' && map.map[newX][newY].agent === null) {
                selected_move = {x: newX, y: newY, move: dir[2]};
                oldest_last_seen = map.map[newX][newY].last_seen;
            }
        }
        // console.log("Selected move", selected_move);
        if (selected_move) {
            pos = {x: selected_move.x, y: selected_move.y};
            key = pos.x + "_" + pos.y;
            visited.set(key, true);
            path.push(selected_move);
            selected_move = null;
            oldest_last_seen = Infinity;
        } else {
            break;
        }
        path_length++;
    }
    // console.log(path, path.length);
    return path;
}

/**
 * Improved BFS searching in least seen areas and based on a simple agent heat map
 * @param pos - Where to start the search
 * @param goal - not used, just here for parameter expansion
 * @param usePDDL - Use PDDL to find the path
 * @returns {{x: number, y: number, move: string}[]} - A list of nodes containing the path to the goal
 */
async function exploreBFS2(pos, goal, usePDDL = false) {

    let best_tile = {x: -1, y: -1, probability: 1};
    let best_utility = -1;

    for (let tile of map.spawnableTiles) {
        let tileX = tile.x;
        let tileY = tile.y;
        let tile_last_seen = map.map[tileX][tileY].last_seen;
        let tile_agent_heat = map.map[tileX][tileY].agent_heat / Math.max(1, agents.size);
        let tile_utility = Math.round(
            tile_last_seen *
            (1 - tile.probability) *
            (tile_agent_heat) *
            (otherAgent.intention.type === "" ?
                    1 :
                    1 - (distance(tile, otherAgent.intention.goal) / (map.width + map.height)) * (1 - (tile_last_seen) / 700)
            )
        );

        if (
            (
                (best_tile.x === -1 && best_tile.y === -1) ||
                best_utility > tile_utility
            )
            && map.cleanBFS(pos, [tile]).length > 1
        ) {
            best_tile = {x: tile.x, y: tile.y, probability: tile.probability};
            best_utility = tile_utility
        }
        if (best_utility === tile_utility && Math.random() > PROBABILITY_KEEP_BEST_TILE) {
            best_tile = {x: tile.x, y: tile.y, probability: tile.probability};
            best_utility = tile_utility
        }
    }

    // console.log("\t", best_tile, best_last_seen, best_agent_heat, "Utility", best_utility);
    let plan = await beamPackageSearch(pos, [best_tile], usePDDL);
    if (plan.length === 1) {
        // console.log("\tPlan length 1");
        plan = map.cleanBFS(pos, [best_tile]);
    }
    //console.log(plan);
    return plan;

}

/**
 * Tries to recover the plan by going around the agent if possible or negotiating the swap of packages to avoid re-planning
 * @param {number} index The index of the failed move in the plan
 * @param {[{x: number, y: number, move: string}]} plan The plan to recover
 * @returns {[{x: number, y: number, move: string}]} The new plan, [] if the plan is not recoverable
 */
async function recoverPlan(index, plan) {
    let x = plan[index].x;
    let y = plan[index].y;
    console.log("[RECOVER PLAN] ");
    if (!map.map[x][y].agent) {
        console.log("\tAgent is gone");
        // if by waiting the agent is gone then try to keep going with the original plan
        plan = plan.slice(index, plan.length);
    } else if (map.map[x][y].agent !== otherAgent.id) {
        console.log("\tAgent is not the other agent");
        // try to go around the agent if possible
        plan = goAround(index, plan);
    } else {
        // TODO: We know it's our friend agent we need to negotiate the swap of packages or who stays still
        console.log('\tAgent is the other agent');
        handleNegotiation(index, plan);
    }
    return plan;
}



/**
 * Tries to go around the agent if possible without going too far and without recalculating the whole path
 * @param {number} index The index of the failed move in the plan
 * @param {[{x: number, y: number, move: string}]} plan The plan to recover
 * @returns {[{x: number, y: number, move: string}]} The new plan, [] if the plan is not recoverable
 */
async function goAround(index, plan) {
    //let currMovX = plan[index].x, currMovY = plan[index].y;
    let currMovX = me.x, currMovY = me.y;
    let newPlan = [];
    if (plan[index + 1]) {
        let objective = [{x: plan[index + 1].x, y: plan[index + 1].y}];
        newPlan = await map.BFS({x: currMovX, y: currMovY, move: 'none'}, objective);
        if (newPlan.length > 6 || newPlan.length === 1) {
            newPlan = []
        } else {
            newPlan = newPlan.concat(plan.slice(index + 2));
        }
    }
    return newPlan;
}

/**
 * Handles the negotiation with the other agent to swap packages or who stays still
 * @param {number} index The index of the failed move in the plan
 * @param {[{x: number, y: number, move: string}]} plan The plan to recover
 * 
 * @returns {[{x: number, y: number, move: string}]} The new plan, [] if the plan is not recoverable
 */
async function handleNegotiation(index, plan) {
    console.log("\t[NEGOTIATION]");
    let x= plan[index].x, y = plan[index].y;
    let newPlan = [];
    if (AgentRole === 1) {
        //first only try to move aside
        newPlan = await MoveAside(index, plan);
        let incomingRequest = await awaitRequest();
        console.log(incomingRequest);
        if (incomingRequest.content.type !== "moveOut") {
            if (incomingRequest.content !== "FAILED") incomingRequest.reply({type: "moveOut", content: "RE-SYNC"});
            plan = [];
        } else if (newPlan.length > 0){
            incomingRequest.reply({type: "moveOut", content: "SUCCESS"});
            plan = newPlan;
            console.log("\t\tMove aside successful");
        } else{
            //if this is not possible then try to go around the other agent
            newPlan = goAround(index, plan);
            incomingRequest = await awaitRequest();
            if (incomingRequest.content.type !== "planAround"){
                if (incomingRequest.content !== "FAILED") incomingRequest.reply({type: "planAround", content: "RE-SYNC"});
                plan = [];
            } else if (newPlan.length > 0){
                incomingRequest.reply({type: "planAround", content: "SUCCESS"});
                plan = newPlan;
                console.log("\t\tPlan around successful");
            } else {
                //TODO: negotiate the swap of packages
                //if this is still not possible then try to negotiate the swap of packages
                plan = [];
                console.log("\t\tHARD REPLAN");
                //otherwise the plan is not recoverable so return an empty plan
            }
        }
    } else {
        //first only try to negotiate the move aside
        let response = await sendRequest({header: "request", content: { type: "moveOut", position: {x: x, y: y}}});
        console.log(response);
        if (response === "RE-SYNC") {
            plan = [];
        } else if (response === "SUCCESS") {
            plan = [{x: x, y: y, move: "wait"}].concat(plan.slice(index));
            console.log("\t\tMove aside successful");
        } else {
            // negotiate the go around
            response = await sendRequest({header: "request", content: { type: "planAround", position: {x: x, y: y}}});
            console.log(response);
            if (response === "RE-SYNC") {
                plan = [];
            } else if (response !== "FAILED") {
                plan = new Array(6).fill({x: x, y: y, move: "wait"}).concat(plan.slice(index));
                console.log("\t\tPlan around successful");
                if (response === "RE-SYNC") {
                    plan = [];
                }
            } else {
                //TODO: negotiate the swap of packages
                // negotiate the swap of packages
                plan = [];
                console.log("\t\tHARD REPLAN");
            }
        }
    }

    return plan;
}

async function MoveAside(index, plan) {
    let newPlan = [];
    let currX = me.x, currY = me.y;
    let currMove = plan[index].move;
    let orthogonalMoves = {
        "up": [[1, 0, "right", "left"], [-1, 0, "left", "right"]],
        "down": [[1, 0, "right", "left"], [-1, 0, "left", "right"]],
        "left": [[0, 1, "up", "down"], [0, -1, "down", "up"]],
        "right": [[0, 1, "up", "down"], [0, -1, "down", "up"]]
    }
    for (let dir of orthogonalMoves[currMove]) {
        let newX = currX + dir[0];
        let newY = currY + dir[1];
        if (
            !map.map[newX][newY].agent
            && map.map[newX][newY].type !== "obstacle"
            && !otherAgent.plan.some((p) => p.x === newX && p.y === newY)
        ){
            newPlan = [{x: newX, y: newY, move: dir[2]}, {x: newX, y: newY, move: "wait"}, {x: currX, y: currY, move: dir[3]}].concat(plan.slice(index));
            break;
        }
    }
    return newPlan;
}

export {beamSearch, beamPackageSearch, deliveryBFS, exploreBFS, exploreBFS2, recoverPlan};