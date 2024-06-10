import {map, MAX_FUTURE} from "../beliefs/map.js";
import {parcels} from "../beliefs/parcels.js";
import {distance, me} from "../beliefs/beliefs.js";
import {agents} from "../beliefs/agents.js";

import {search_path} from "./search_planners.js";
import {PDDL_path, PDDL_pickupAndDeliver} from "./PDDL_planners.js";

import {otherAgent} from "../coordination/coordination.js";

import {PROBABILITY_KEEP_BEST_TILE, TIME_PENALTY, MAX_EXPLORE_PATH_LENGTH} from "../config.js";


/**
 * Searches in a corridor for parcels to pick up
 * @param {[{x: number, y: number, move: string}]} path The plan to soft replan
 * @param {[{x: number, y: number}]} objective The objective to reach - ignored with PDDL
 * @param {boolean} PDDL Use PDDL to find the path
 */
async function beamSearch(path, objective, PDDL = false) {
    // console.log("\t[BEAM SEARCH]\n\tObjective", objective);
    // console.log("\t[BEAM SEARCH]\n\tOriginal path", path);

    // define the directions to explore
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

    // Compute the updated path
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
                allowedDeviations[x][y] = false; // don't allow deviations from this tile anymore
                //console.log("\texploring deviation at", x, y);

                if (map.map[x][y].parcel && !map.map[x][y].agent) { 
                    // if there is a package on the way
                    let parcel = parcels.get(map.map[x][y].parcel.id);

                    if (parcel && !parcel.carried) {
                        //console.log("\t\tfound a package at", x, y);

                        // Add a deviation to the path
                        let deviation = [{x: x, y: y, move: dir[2]}];
                        let newPath;

                        if (dir[2] === "pickup") {
                            // console.log("\t\tcollecting package at", x, y);
                            newPath = path.slice(stepNum + 1)
                        } else {

                            if (!PDDL) {
                                // If not using PDDL, search for the new path from the deviation
                                newPath = search_path({x: x, y: y}, objective, move);
                            } else {
                                // Otherwise, since planning is expensive, get back to the original path
                                let goBackMove = {x: step.x, y: step.y, move: "none"};
                                if (dir[2] === "right") goBackMove.move = "left";
                                if (dir[2] === "left") goBackMove.move = "right";
                                if (dir[2] === "up") goBackMove.move = "down";
                                if (dir[2] === "down") goBackMove.move = "up";
                                newPath = [goBackMove].concat(path.slice(stepNum + 1));
                            }

                        }

                        // Update the path
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
 * Beam search to find the path to the closest objective. 
 * It use BFS to create a path to the objective, 
 * then allow for slight deviations to gather other packages on the way
 *
 * @param {{x: number, y: number}} pos The starting position
 * @param {[{x: number, y: number}]} objective The objective to reach
 * @param {number} deviations The number of allowed deviations from the path
 * @param {boolean} fallback If the search should fallback to BFS if the objective is unreachable
 * @param {boolean} PDDL If the search should use PDDL or not
 * @returns {[{x: number, y: number, move: string}]} The path to the objective
 */
async function beamPackageSearch(pos, objective, PDDL = false, fallback = true) {
    if (!(objective instanceof Array)) objective = [objective];
    let path = [];

    // Use the requested planner to find the path
    if (PDDL) {
        path = await PDDL_path(pos, objective, fallback);
    } else {
        path = search_path(pos, objective, fallback);
    }

    // Search for packages on the way
    path = await beamSearch(path, objective, PDDL);

    return path;
}

/**
 * Planner that attempts to find a path to pick up and deliver a package in one call
 * @param pos
 * @param objective
 * @returns {Promise<{x: number, y: number, move: string}[]>}
 */
async function pickupAndDeliver(pos, objective) {
    let path = [];
    if (!(objective instanceof Array)) objective = [objective];

    // First, try to find a path to the package
    if (objective.length === 1) path = await PDDL_pickupAndDeliver(pos, objective);

    // If unsuccessful, try to find a path only to the package
    if (path.length === 0) {
        path = await beamPackageSearch(pos, objective, true);
    } else {
        path = await beamSearch(path, objective, true);
    }

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
    // Compute the path to the closest delivery zone
    let list = await beamPackageSearch(pos, map.deliveryZones, usePDDL);

    // Add a move to the last position to deliver the package
    let last_move = list.at(-1);
    if (!last_move) last_move = pos;

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
function exploreClimb(pos, goal, usePDDL = false) {
    // Select goal based on the last sensed time of the tile
    let path = [];
    let directions = [[0, 1, 'up'], [0, -1, 'down'], [1, 0, 'right'], [-1, 0, 'left']];
    let path_length = 0;
    let oldest_last_seen = Infinity;
    let visited = new Map();
    let selected_move = null;
    let key = "";
    let heuristic = Math.max(me.config.PARCELS_OBSERVATION_DISTANCE - 3, 1);

    // If the agent is close to the border, reduce the heuristic
    if (pos.x <= (heuristic + 2) || pos.x >= (map.width - heuristic - 2) || pos.y <= (heuristic + 2) || pos.y >= (map.height - heuristic - 2)) {
        heuristic = 0;
    }

    // Create the path
    while (path_length < MAX_EXPLORE_PATH_LENGTH) {
        //console.log("Exploring", pos);

        // Choose the next move based on the oldest last seen tile
        for (let dir of directions) {
            let newX = pos.x + dir[0];
            let newY = pos.y + dir[1];
            key = newX + "_" + newY;
            //console.log("visited", visited.has(key), key);

            // Check if the tile is valid, has not been visited and it improves the last seen time
            if ((newX >= heuristic) && (newX < (map.width - heuristic)) && (newY >= heuristic) && (newY < (map.height - heuristic))
                && map.map[newX][newY].last_seen < oldest_last_seen && (!visited.has(key))
                && map.map[newX][newY].type !== 'obstacle' && map.map[newX][newY].agent === null) {
                selected_move = {x: newX, y: newY, move: dir[2]};
                oldest_last_seen = map.map[newX][newY].last_seen;
            }
        }
        
        // console.log("Selected move", selected_move);
        
        if (selected_move) {
            // If a move was selected, add it to the path
            pos = {x: selected_move.x, y: selected_move.y};
            key = pos.x + "_" + pos.y;
            visited.set(key, true);
            path.push(selected_move);
            selected_move = null;
            oldest_last_seen = Infinity;
        } else {
            // If no move was selected, break the loop
            break;
        }

        path_length++;
    }

    // console.log(path, path.length);
    return path;
}

/**
 * Improved BFS searching in least seen areas and based on a simple agent heat map and regions of spawnable tiles
 * 
 * @param pos - Where to start the search
 * @param goal - not used, just here for parameter expansion
 * @param usePDDL - Use PDDL to find the path
 * @returns {{x: number, y: number, move: string}[]} - A list of nodes containing the path to the goal
 */
async function exploreBFS(pos, goal, usePDDL = false) {
    // console.log("\t[EXPLORE BFS]");
    let best_tile = {x: -1, y: -1, probability: 1};
    let best_loss = -1;

    // Loop through all the spawnable tiles and calculate the loss of each tile
    for (let tile of map.spawnableTiles) {
        let tileX = tile.x;
        let tileY = tile.y;
        let tile_last_seen = map.map[tileX][tileY].last_seen;
        let tile_agent_heat = map.map[tileX][tileY].agent_heat / Math.max(1, agents.size);
        let tile_loss = Math.round(
            tile_last_seen *
            (1 - tile.probability) *
            (tile_agent_heat) *
            (otherAgent.intention.type === "" ?
                    1 :
                    1 - (distance(tile, otherAgent.intention.goal) / (map.width + map.height)) * (1 - (tile_last_seen) / 700)
            )
        );

        
        if (
            ( // If the tile is better than the current best tile
                best_tile.x === -1
                || best_loss >= tile_loss
            )
            
            && (map.cleanBFS(pos, [tile]).length > 1 || (pos.x === tileX && pos.y === tileY)) // And the tile is reachable
            
            && ( // And the tile is not in the same region as the other agent's goal
                otherAgent.intention.type === "" || otherAgent.intention.type === "deliver"
                || map.numberOfRegions < 2
                || (map.map[otherAgent.intention.goal.x][otherAgent.intention.goal.y].RegionIndex !== map.map[tileX][tileY].RegionIndex)
            )
        ) {
            if (best_loss === tile_loss) {
                // When equal, randomly choose to keep the current best tile
                if (Math.random() > PROBABILITY_KEEP_BEST_TILE) {
                    best_tile = {x: tile.x, y: tile.y, probability: tile.probability};
                    best_loss = tile_loss
                }
            } else {
                // Otherwise, update the best tile
                best_tile = {x: tile.x, y: tile.y, probability: tile.probability};
                best_loss = tile_loss
            }
        }

    }

    if (best_tile.x === -1) {
        //no available tiles, go to the closest delivery zone
        console.log("\tNo available tiles, going to the closest delivery zone");
        return await beamPackageSearch(pos, map.deliveryZones, usePDDL);
    }

    // give penality to all the tiles in the region of the best tile
    let region = map.map[best_tile.x][best_tile.y].RegionIndex;
    for (let tile of map.spawnableTiles) {
        if (map.map[tile.x][tile.y].RegionIndex === region) {
            // console.log("\tPenalizing tile", tile);
            map.map[tile.x][tile.y].last_seen += TIME_PENALTY;
        }
    }

    // console.log("\t", best_tile, best_last_seen, best_agent_heat, "loss", best_loss);

    // Search for the path to the best tile
    let plan = await beamPackageSearch(pos, [best_tile], usePDDL, true);

    //console.log(plan);
    return plan;
}


export {beamSearch, beamPackageSearch, deliveryBFS, pickupAndDeliver, exploreBFS as exploreBFS2};