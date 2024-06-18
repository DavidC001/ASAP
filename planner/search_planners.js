import {map, MAX_FUTURE} from "../beliefs/map.js";
import { otherAgent } from "../coordination/coordination.js";

import {MAX_WAIT} from "../config.js";

/**
 * BFS to find the path to the closest objective
 *
 * @param {{x: number, y: number}} pos The starting position
 * @param {[{x: number, y: number}]} objectiveList The list of objectives to reach
 * @param {number} startTime The time to start the search from for future predictions (default 0)
 * @returns {[{x: number, y: number, move: string}]} The path to the objective
 */
function BFStoObjective(pos, objectiveList, startTime = 0) {
    // Initialization
    let queue = [];
    let visited = new Array(map.width).fill().map(() => new Array(map.height).fill().map(() => 0));
    queue.push([pos]);
    if (!(objectiveList instanceof Array)) objectiveList = [objectiveList];
    visited[pos.x][pos.y] = 1;
    let current = null;
    let node = null;
    // Allowed moves: up, down, right, left, wait
    let directions = [[[0, 1, 'up'], [0, -1, 'down'], [1, 0, 'right'], [-1, 0, 'left'], [0, 0, 'wait']],
        [[1, 0, 'right'], [-1, 0, 'left'], [0, 1, 'up'], [0, -1, 'down'], [0, 0, 'wait']]];

    //if predictedMap is not available, return empty path
    if (!map.predictedMap) return [pos];
    
    // BFS
    while (queue.length > 0) {
        current = queue.shift();
        node = current.at(-1)

        // Check if the node is an objective
        for (let goal of objectiveList) {
            if ((node.x === goal.x && node.y === goal.y)) {
                return current;
            }
        }

        // Try to move in all directions
        for (let dir of directions[current.length % 2]) {
            let newX = node.x + dir[0];
            let newY = node.y + dir[1];

            // We don't push the node if out of bound or there is an agent on it or we already visited it
            if ((newX >= 0) && (newX < map.width) && (newY >= 0) && (newY < map.height)
                && (!visited[newX][newY] || (dir[2] === 'none' && visited[newX][newY] < MAX_WAIT)) // Wait is allowed to be visited multiple times
                && map.predictedMap[startTime][newX][newY].type !== 'obstacle' // Check if the node is an obstacle
                && map.predictedMap[startTime][newX][newY].agent === null // Check if the node has an agent
                && (startTime > 1 || map.map[newX][newY].agent === null) // Check if the node has an agent when we are performing the first move
                && !otherAgent.plan.some(move => move.x === newX && move.y === newY) // Check if the node is in the plan of the  another agent
            ) {
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
 * A simple BFS that gives the path to the objective. Considers the current map and does count Agents as obstacles
 * @param pos - The starting position
 * @param objective - The objective of the BFS
 * @returns {*|*[]} - A path to the objective if possible to reach
*/
function frozenBFS(pos, objective) {
    let queue = [];
    let visited = new Array(map.width).fill().map(() => new Array(map.height).fill().map(() => false));
    queue.push([{x: pos.x, y: pos.y, move: 'none'}]);
    if (!(objective instanceof Array)) objective = [objective];
    //console.log(map.width, map.height);
    visited[pos.x][pos.y] = true;
    let current = null;
    let node = null;
    let directions = [[[0, 1, 'up'], [0, -1, 'down'], [1, 0, 'right'], [-1, 0, 'left']],
        [[1, 0, 'right'], [-1, 0, 'left'], [0, 1, 'up'], [0, -1, 'down']]];

    //if objective is obstructed, remove it from the list
    objective = objective.filter(objective => {
        return (
            map.map[objective.x][objective.y].type !== 'obstacle' 
            && map.map[objective.x][objective.y].agent === null
        );
    });

    // BFS
    while (queue.length > 0) {
        current = queue.shift();
        node = current.at(-1)

        // Check if the node is an objective
        for (let obj of objective) {
            if (node.x === obj.x && node.y === obj.y) {
                // console.log("Path found");
                return current;
            }
        }

        // Try to move in all directions
        for (let dir of directions[current.length % 2]) {
            let newX = node.x + dir[0];
            let newY = node.y + dir[1];
            if ((newX >= 0) && (newX < map.width) && (newY >= 0) && (newY < map.height)
                && (!visited[newX][newY])
                && map.map[newX][newY].type !== 'obstacle'
                && map.map[newX][newY].agent === null
            ) {
                // console.log( "checking", newX, newY, map.width, map.height, visited[newX][newY], map.map[newX][newY].type, map.map[newX][newY].agent);
                let newCurrent = JSON.parse(JSON.stringify(current));
                newCurrent.push({x: newX, y: newY, move: dir[2]});
                queue.push(newCurrent);
                visited[newX][newY] = true;
            }
        }
    }

    // If we don't find a path, return an empty array
    // console.log("No path found");
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
        path = frozenBFS(pos, objective);
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

export {search_path, BFStoObjective, frozenBFS}