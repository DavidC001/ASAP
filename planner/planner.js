import {map, MAX_FUTURE} from "../beliefs/map/map.js";
import {me} from "../beliefs/beliefs.js";
import {agents} from "../beliefs/agents/agents.js";

const MAX_EXPLORE_PATH_LENGTH = 20;

/**
 * BFS to find the path to the closest objective
 *
 * @param {{x: number, y: number}} pos The starting position
 * @param {[{x: number, y: number}]} objectiveList The list of objectives to reach
 * @param {number} startTime The time to start the search from for future predictions (default 0)
 * @returns {[{x: number, y: number, move: string}]} The path to the objective
 */
function BFStoObjective(pos, objectiveList, startTime = 0) {
    let queue = [];
    let visited = new Array(map.width).fill().map(() => new Array(map.height).fill().map(() => false));
    queue.push([pos]);
    visited[pos.x][pos.y] = true;
    let current = null;
    let node = null;
    let directions = [[[0, 1, 'up'], [0, -1, 'down'], [1, 0, 'right'], [-1, 0, 'left']],
        [[1, 0, 'right'], [-1, 0, 'left'], [0, 1, 'up'], [0, -1, 'down']]];
    let blocked_goals = [];

    for (let goal of objectiveList) {
        if (map.predictedMap[MAX_FUTURE - 1][goal.x][goal.y].type === 'obstacle'
            || map.predictedMap[MAX_FUTURE - 1][goal.x][goal.y].agent !== null) {
            blocked_goals.push(goal);
        }
    }

    while (queue.length > 0) {
        current = queue.shift();
        node = current.at(-1)

        // Se la posizione di consegna è bloccata, la salto
        for (let goal of objectiveList) {
            if (!blocked_goals.includes(goal)) {
                if ((node.x === goal.x && node.y === goal.y)) {
                    return current.slice(1);
                }
            }
        }
        // Controllo che il nodo che sto esplorando non abbia sopra un agente, prima di esplorarlo
        for (let dir of directions[current.length % 2]) {
            let newX = node.x + dir[0];
            let newY = node.y + dir[1];
            // We don't push the node if out of bound or there is an agent on it
            if ((newX >= 0) && (newX < map.width) && (newY >= 0) && (newY < map.height)
                && (!visited[newX][newY])
                && map.predictedMap[startTime][newX][newY].type !== 'obstacle'
                && map.predictedMap[startTime][newX][newY].agent === null
                && (startTime > 1 || map.map[newX][newY].agent === null)) {
                let newCurrent = current.slice();
                newCurrent.push({x: newX, y: newY, move: dir[2]});
                queue.push(newCurrent);
                visited[newX][newY] = true;
            }
        }
        // Increase startTime until we reached the MAX_FUTURE for the predictedMap
        if (startTime < (MAX_FUTURE - 1)) startTime++;
    }

    // If we don't find a path, return an empty array
    return [];
}

/**
 * BFS to find the path to the closest delivery zone and deliver the package
 *
 * @param {{x: number, y: number}} pos The starting position
 * @param {[{x: number, y: number}]} objectiveList The list of delivery zones
 * @returns {[{x: number, y: number, move: string}]} The path to the objective
 */
function deliveryBFS(pos, objectiveList) {
    let list = beamPackageSearch(pos, map.deliveryZones);
    if (list.length === 1) {
        // We reach the last possible position if it is blocked
        list = map.cleanBFS(pos, objectiveList);
    }
    let last_move = list.at(-1);
    // Add a move to the last position to deliver the package
    list.push({x: last_move.x, y: last_move.y, move: "deliver"});

    return list;
}

/**
 * Beam search to find the path to the closest objective
 *
 * @param {{x: number, y: number}} pos The starting position
 * @param {[{x: number, y: number}]} objective The objective to reach
 * @param {number} deviations The number of allowed deviations from the path
 * @returns {[{x: number, y: number, move: string}]} The path to the objective
 */
function beamPackageSearch(pos, objective, deviations = 1) {
    //use BFS to create a path to the objective, then allow for slight deviations to gather other packages on the way
    if (!(objective instanceof Array)) objective = [objective];
    let path = [{x: pos.x, y: pos.y, move: "none"}].concat(BFStoObjective(pos, objective));
    if (path.length === 1) {
        //use normal BFS to find the path
        // console.log("\t[BEAM SEARCH] No path found, using BFS");
        path = path.concat(map.BFS(pos, objective));
        // console.log("\t[BEAM SEARCH] BFS path", path);
        if (path.length === 1) {
            //fallback to clean BFS
            // console.log("\t[BEAM SEARCH] No path found, using clean BFS");
            path = path.concat(map.cleanBFS(pos, objective));
            // console.log("\t[BEAM SEARCH] Clean BFS path", path);
        }
    }

    // console.log("\t[BEAM SEARCH] Original path", path);

    let directions = [[0, 0, "pickup"],
        [1, 0, "right"], [-1, 0, "left"],
        [0, 1, "up"], [0, -1, "down"]];
    let move = 0;

    //calculate allowed deviations tiles
    let allowedDeviations = new Array(map.width).fill().map(() => new Array(map.height).fill().map(() => false));
    for (let step of path) {
        if (deviations === 0) {
            allowedDeviations[step.x][step.y] = true;
        } else {
            for (let i = 0; i < deviations; i++) {
                for (let dir of directions) {
                    let x = step.x + dir[0];
                    let y = step.y + dir[1];
                    if (x >= 0 && x < map.width && y >= 0 && y < map.height
                        && !(map.predictedMap[move][x][y].agent)
                        && !(map.predictedMap[move][x][y].type === "obstacle")) {
                        allowedDeviations[x][y] = true;
                    }
                }
            }
            if (move < (MAX_FUTURE - 1)) move++;
        }
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
            if (x >= 0 && x < map.width && y >= 0 && y < map.height && allowedDeviations[x][y]) {
                //console.log("\texploring deviation at", x, y);
                if (map.map[x][y].parcel && !map.map[x][y].parcel.carried) {
                    //console.log("\t\tfound a package at", x, y);

                    //add a deviation to the path
                    let deviation = [{x: x, y: y, move: dir[2]}];
                    let newPath;
                    if (dir[2] === "pickup") {
                        // console.log("\t\tcollecting package at", x, y);
                        allowedDeviations[x][y] = false;
                        // newPath = path.slice(stepNum + 1);
                        newPath = BFStoObjective({x: x, y: y}, objective, move);
                    } else {
                        newPath = BFStoObjective({x: x, y: y}, objective, move);
                        if (move < (MAX_FUTURE - 1)) move++;
                    }
                    path = path.slice(0, stepNum + 1)
                        .concat(deviation)
                        .concat(newPath);
                    // console.log("\t\t[BEAM SEARCH] deviation added to the path", path);
                    break;
                }
            }
        }
        if (move < (MAX_FUTURE - 1)) move++;
    }

    //console.log("Beam search", path);
    return path;
}

/**
 * Hill climbing for exploring unknown areas
 *
 * @param {{x: number, y: number}} pos - The starting position
 * @param {*} goal The goal to reach, not used, just here for parameter expansion
 *
 * @returns {[{x: number, y: number, move: string}]} The explore path
 */
function exploreBFS(pos, goal) {
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
 * @param goal - Where to go
 * @returns {{x: number, y: number, move: string}[]} - A list of nodes containing the path to the goal
 */
function exploreBFS2(pos, goal) {
    let best_last_seen = -1;
    let best_agent_heat = -1;
    let best_tile = {x: -1, y: -1, probability: 1};

    for (let tile of map.spawnableTiles) {
        let tileX = tile.x;
        let tileY = tile.y;
        let tile_last_seen = map.map[tileX][tileY].last_seen;
        let tile_agent_heat = map.map[tileX][tileY].agent_heat / Math.max(1, agents.size);

        if (
            (
                (best_tile.x === -1 && best_tile.y === -1) ||
                (best_last_seen * (1 - best_tile.probability) * (best_agent_heat)) > (tile_last_seen * (1 - tile.probability) * (tile_agent_heat))
            )
            && tile.x !== me.x && tile.y !== me.y) {

            best_last_seen = tile_last_seen;
            best_agent_heat = tile_agent_heat;

            best_tile = {x: tile.x, y: tile.y, probability: tile.probability};
        }
    }

    console.log("\t", best_tile, best_last_seen, best_agent_heat);
    let plan = beamPackageSearch(pos, [best_tile]);
    if (plan.length === 1) {
        // console.log("\tPlan length 1");
        plan = map.cleanBFS(pos, [best_tile]);
    }
    //console.log(plan);
    return plan;

}

export {BFStoObjective, beamPackageSearch, deliveryBFS, exploreBFS, exploreBFS2};