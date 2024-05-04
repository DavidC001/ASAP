import {map, MAX_FUTURE} from "../beliefs/map/map.js";

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

export {deliveryBFS}