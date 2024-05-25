import {map, MAX_FUTURE} from "../beliefs/map/map.js";
import {me} from "../beliefs/beliefs.js";
import {agents} from "../beliefs/agents/agents.js";
import { parcels } from "../beliefs/parcels/parcels.js";

const MAX_WAIT = 10;

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
    let visited = new Array(map.width).fill().map(() => new Array(map.height).fill().map(() => 0));
    queue.push([pos]);
    visited[pos.x][pos.y] = 1;
    let current = null;
    let node = null;
    let directions = [[[0, 1, 'up'], [0, -1, 'down'], [1, 0, 'right'], [-1, 0, 'left'], [0, 0, 'none']],
        [[1, 0, 'right'], [-1, 0, 'left'], [0, 1, 'up'], [0, -1, 'down'], [0, 0, 'none']]];
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
                    return current;
                }
            }
        }
        // Controllo che il nodo che sto esplorando non abbia sopra un agente, prima di esplorarlo
        for (let dir of directions[current.length % 2]) {
            let newX = node.x + dir[0];
            let newY = node.y + dir[1];
            // We don't push the node if out of bound or there is an agent on it
            if ((newX >= 0) && (newX < map.width) && (newY >= 0) && (newY < map.height)
                && (!visited[newX][newY] || (dir[2] === 'none' && visited[newX][newY] < MAX_WAIT))
                && map.predictedMap[startTime][newX][newY].type !== 'obstacle'
                && map.predictedMap[startTime][newX][newY].agent === null
                && (startTime > 1 || map.map[newX][newY].agent === null)) {
                let newCurrent = current.slice();
                newCurrent.push({x: newX, y: newY, move: dir[2]});
                queue.push(newCurrent);
                visited[newX][newY]++;
            }
        }
        // Increase startTime until we reached the MAX_FUTURE for the predictedMap
        if (startTime < (MAX_FUTURE - 1)) startTime++;
    }

    // If we don't find a path, return an empty array
    return [pos];
}

/**
 * Use BFS to find the path to the closest objective
 * 
 * @param {{x: number, y: number}} pos
 * @param {[{x: number, y: number}]} objective
 * @param {boolean} fallback
 * @returns {[{x: number, y: number, move: string}]} path to the objective
 */
function search_path(pos, objective, fallback = true) {
    pos = {x: pos.x, y: pos.y, move: "none"};
    let path = BFStoObjective(pos, objective);
    if (path.length === 1 && fallback) {
        //use normal BFS to find the path
        // console.log("\t[BEAM SEARCH] No path found, using BFS");
        path = map.BFS(pos, objective);
        // console.log("\t[BEAM SEARCH] BFS path", path);
        if (path.length === 1) {
            //fallback to clean BFS
            // console.log("\t[BEAM SEARCH] No path found, using clean BFS");
            path = map.cleanBFS(pos, objective);
            // console.log("\t[BEAM SEARCH] Clean BFS path", path);
        }
    }
    // console.log("\t\t[PATH SEARCH] Path found", path);
    return path;
}

export {search_path};