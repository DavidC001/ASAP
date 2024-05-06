import {map, MAX_FUTURE} from "../beliefs/map/map.js";
import {me} from "../beliefs/beliefs.js";

const MAX_EXPLORE_PATH_LENGTH = 20;

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
        if (map.map[node.x][node.y].agent === null) {
            for (let dir of directions[current.length % 2]) {
                let newX = node.x + dir[0];
                let newY = node.y + dir[1];
                if ((newX >= 0) && (newX < map.width) && (newY >= 0) && (newY < map.height)
                    && (!visited[newX][newY])
                    && map.predictedMap[startTime][newX][newY].type !== 'obstacle'
                    && map.predictedMap[startTime][newX][newY].agent === null) {
                    let newCurrent = JSON.parse(JSON.stringify(current));
                    newCurrent.push({x: newX, y: newY, move: dir[2]});
                    queue.push(newCurrent);
                    visited[newX][newY] = true;
                }
            }
        }
        if (startTime < (MAX_FUTURE - 1)) startTime++;
    }

    // If we don't find a path, return an empty array
    return [];
}

function cleanBFS(pos, objectiveList) {
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
        if (map.predictedMap[MAX_FUTURE - 1][goal.x][goal.y].type === 'obstacle') {
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
        if (map.map[node.x][node.y].agent === null) {
            for (let dir of directions[current.length % 2]) {
                let newX = node.x + dir[0];
                let newY = node.y + dir[1];
                if ((newX >= 0) && (newX < map.width) && (newY >= 0) && (newY < map.height)
                    && (!visited[newX][newY])
                    && map.predictedMap[startTime][newX][newY].type !== 'obstacle') {
                    let newCurrent = JSON.parse(JSON.stringify(current));
                    newCurrent.push({x: newX, y: newY, move: dir[2]});
                    queue.push(newCurrent);
                    visited[newX][newY] = true;
                }
            }
        }
        if (startTime < (MAX_FUTURE - 1)) startTime++;
    }

    // If we don't find a path, return an empty array
    return [];
}
    

function deliveryBFS(pos, objectiveList) {
    let list = beamPackageSearch(pos, map.deliveryZones);
    if (list.length === 0) {
        //as close as possible
        list = cleanBFS(pos, objectiveList);
    } else {
        let last_move = list.at(-1);
        // Add a move to the last position to deliver the package
        if (last_move) list.push({x: last_move.x, y: last_move.y, move: "deliver"});
    }
    return list;
}

function beamPackageSearch(pos, objective, deviations = 1) {
    //use BFS to create a path to the objective, then allow for slight deviations to gather other packages on the way
    if (!(objective instanceof Array)) objective = [objective];
    let path = [{x: pos.x, y: pos.y, move: "none"}].concat(BFStoObjective(pos, objective));

    let directions = [[0, 0, "still"],
        [1, 0, "right"], [-1, 0, "left"],
        [0, 1, "up"], [0, -1, "down"]];
    let move = 0;

    //calculate allowed deviations tiles
    let allowedDeviations = new Array(map.width).fill().map(() => new Array(map.height).fill().map(() => false));
    for (let step of path) {
        if (step.move === "pickup") continue;

        for (let i = 1; i <= deviations; i++) {
            for (let dir of directions) {
                let x = step.x + dir[0];
                let y = step.y + dir[1];
                if (x >= 0 && x < map.width && y >= 0 && y < map.height
                    && (!map.predictedMap[move][x][y].agent || map.predictedMap[move][x][y].agent === me.id)
                    && !(map.predictedMap[move][x][y].type === "obstacle")) {
                    allowedDeviations[x][y] = true;
                }
            }
        }

        if (move < (MAX_FUTURE - 1)) move++;
    }

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
                    let deviation;
                    if (dir[2] === "still") {
                        deviation = [{x: x, y: y, move: "pickup"}];
                        allowedDeviations[x][y] = false;
                    } else {
                        deviation = [{x: x, y: y, move: dir[2]}, {x: x, y: y, move: "pickup"}];
                        allowedDeviations[x][y] = false;
                    }
                    //add the deviation to the path
                    path = path.slice(0, stepNum + 1).concat(deviation).concat(BFStoObjective({
                        x: x,
                        y: y
                    }, objective, move));
                    //console.log("\t\tdeviation added to the path", path);
                    break;
                }
            }
        }
        if (move < (MAX_FUTURE - 1)) move++;
    }

    return path;
}

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
    let heuristic = Math.max(me.config.PARCELS_OBSERVATION_DISTANCE - 2, 1);
    if (pos.x < (heuristic + 2) || pos.x > (map.width - heuristic - 2) || pos.y < (heuristic + 2) || pos.y > (map.height - heuristic - 2)) {
        heuristic = 1;
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

export {BFStoObjective, beamPackageSearch, deliveryBFS, exploreBFS};