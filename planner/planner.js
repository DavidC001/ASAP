import {map} from "../beliefs/map/map.js";

function deliveryBFS(pos) {
    let queue = [];
    let visited = new Array(map.width).fill().map(() => new Array(map.height).fill().map(() => false));
    queue.push([pos]);
    visited[pos.x][pos.y] = true;
    let current = null;
    let node = null;
    let directions = [[[0, 1, 'up'], [0, -1, 'down'], [1, 0, 'right'], [-1, 0, 'left']],
        [[1, 0, 'right'], [-1, 0, 'left'], [0, 1, 'up'], [0, -1, 'down']]];
    let blocked_delivery_zones = [];

    for(let delivery_zone of map.deliveryZones) {
        if (map.map[delivery_zone.x][delivery_zone.y].type === 'obstacle'
            || map.map[delivery_zone.x][delivery_zone.y].agent !== null) {
            blocked_delivery_zones.push(delivery_zone);
        }else if (blocked_delivery_zones.includes(delivery_zone)) {
            blocked_delivery_zones.splice(blocked_delivery_zones.indexOf(delivery_zone), 1);
        }
    }

    while (queue.length > 0) {
        current = queue.shift();
        node = current.at(-1)

        // Se la posizione di consegna è bloccata, la salto
        for(let delivery_zone of map.deliveryZones) {
            if(blocked_delivery_zones.includes(delivery_zone)) {
                continue;
            }
            if (node.x === delivery_zone.x && node.y === delivery_zone.y) {
                return current.slice(1);
            }
        }

        for (let dir of directions[current.length % 2]) {
            let newX = node.x + dir[0];
            let newY = node.y + dir[1];
            if ((newX >= 0) && (newX < map.width) && (newY >= 0) && (newY < map.height)
                && (!visited[newX][newY])
                && map.map[newX][newY].type !== 'obstacle'
                && map.map[newX][newY].agent === null) {
                let newCurrent = JSON.parse(JSON.stringify(current));
                newCurrent.push({x: newX, y: newY, move: dir[2]});
                queue.push(newCurrent);
                visited[newX][newY] = true;
            }
        }
    }

    // If we don't find a path, return an empty array
    return [];
}

export {deliveryBFS}