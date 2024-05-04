import {map, MAX_FUTURE} from "../beliefs/map/map.js";
import { me } from "../beliefs/beliefs.js";


function GoToBFS(pos, objectiveList, timeOffset = 0) {
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
        } else if (blocked_goals.includes(goal)) {
            blocked_goals.splice(blocked_goals.indexOf(goal), 1);
        }
    }

    let counter = timeOffset;
    while (queue.length > 0) {
        current = queue.shift();
        node = current.at(-1)

        // Se la posizione di consegna è bloccata, la salto
        for (let goal of objectiveList) {
            if (!blocked_goals.includes(goal)) {
                if (node.x === goal.x && node.y === goal.y) {
                    return current.slice(1);
                }
            }
        }
        for (let dir of directions[current.length % 2]) {
            let newX = node.x + dir[0];
            let newY = node.y + dir[1];
            if ((newX >= 0) && (newX < map.width) && (newY >= 0) && (newY < map.height)
                && (!visited[newX][newY])
                && map.predictedMap[counter][newX][newY].type !== 'obstacle'
                && map.predictedMap[counter][newX][newY].agent === null) {
                let newCurrent = JSON.parse(JSON.stringify(current));
                newCurrent.push({x: newX, y: newY, move: dir[2]});
                queue.push(newCurrent);
                visited[newX][newY] = true;
            }
        }
        if (counter < (MAX_FUTURE - 1)) counter++;
    }

    // If we don't find a path, return an empty array
    return [];
}

function deliveryBFS(pos, objectiveList) {
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
        } else if (blocked_goals.includes(goal)) {
            blocked_goals.splice(blocked_goals.indexOf(goal), 1);
        }
    }

    let counter = 0;
    while (queue.length > 0) {
        current = queue.shift();
        node = current.at(-1)

        // Se la posizione di consegna è bloccata, la salto
        for (let goal of objectiveList) {
            if (!blocked_goals.includes(goal)) {
                if (node.x === goal.x && node.y === goal.y) {
                    return current.slice(1);
                }
            }
        }
        for (let dir of directions[current.length % 2]) {
            let newX = node.x + dir[0];
            let newY = node.y + dir[1];
            if ((newX >= 0) && (newX < map.width) && (newY >= 0) && (newY < map.height)
                && (!visited[newX][newY])
                && map.predictedMap[counter][newX][newY].type !== 'obstacle'
                && map.predictedMap[counter][newX][newY].agent === null) {
                let newCurrent = JSON.parse(JSON.stringify(current));
                newCurrent.push({x: newX, y: newY, move: dir[2]});
                queue.push(newCurrent);
                visited[newX][newY] = true;
            }
        }
        if (counter < (MAX_FUTURE - 1)) counter++;
    }

    // If we don't find a path, return an empty array
    return [];
}

function pickUpDjikstra(pos, objective, deviations=1) {
    //use BFS to create a path to the objective, then allow for slight deviations to gather other packages on the way
    let path = [{x:pos.x,y:pos.y,move:"none"}].concat(GoToBFS(pos, [objective]));

    let directions = [[0, 0, "still"],
                        [1, 0,"right"], [-1, 0,"left"], 
                        [0, 1,"up"], [0, -1,"down"]];
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
                    && (!map.predictedMap[move][x][y].agent || map.predictedMap[move][x][y].agent==me.id) 
                    && !(map.predictedMap[move][x][y].type === "obstacle")) {
                        allowedDeviations[x][y] = true;
                }
            }
        }

        if (move < MAX_FUTURE-1) move++;
    }

    move = 0;
    for (let stepNum = 0; stepNum < path.length; stepNum++) {
        let step = path[stepNum]
        if (step.move === "pickup") continue;

        //check if there are any packages on the way or in the vicinity
        for (let dir of directions) {
            let x = step.x + dir[0];
            let y = step.y + dir[1];
            if ( x >= 0 && x < map.width && y >= 0 && y < map.height && allowedDeviations[x][y]) {
                //console.log("\texploring deviation at", x, y);
                if (map.map[x][y].parcel && !map.map[x][y].parcel.carried) {
                    //console.log("\t\tfound a package at", x, y);
                    //add a deviation to the path
                    let deviation;
                    if (dir[2]==="still"){
                        deviation = [{x:x,y:y,move:"pickup"}];
                        allowedDeviations[x][y] = false;
                    }else {
                        deviation = [{x:x,y:y,move:dir[2]},{x:x,y:y,move:"pickup"}];
                        allowedDeviations[x][y] = false;
                    }
                    //add the deviation to the path
                    path = path.slice(0,stepNum+1).concat(deviation).concat(GoToBFS({x:x,y:y}, [objective], move));
                    //console.log("\t\tdeviation added to the path", path);
                    break;
                }
            }
        }
        if (move < MAX_FUTURE) move++;
    }

    return path;
}

export {deliveryBFS, pickUpDjikstra};