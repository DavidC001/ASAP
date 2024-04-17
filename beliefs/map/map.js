import {parcels, Parcel} from "../parcels/parcels.js";
import {distance} from "../beliefs.js"
import {agents, Agent} from "../agents/agents.js";

const MAX_FUTURE = 10;

/**
 * @class Tile
 *
 * @param {number} heuristic - The heuristic value of the tile
 * @param {{x:number,y:number}} closest_delivery - The closest delivery zone
 * @param {string} type - The type of the tile between spawnable, delivery and obstacle
 * @param {Agent} agent - The agent on the tile
 * @param {Parcel} parcel - The parcel on the tile
 */
class Tile {
    heuristic;
    closest_delivery;
    type = 'obstacle';
    agent = null;
    parcel = null;


    constructor(tileData) {
        this.heuristic = tileData.heuristic;
        this.closest_delivery = tileData.closest_delivery;
    }
}

/**
 * @class Map
 *
 * @param {number} width - The width of the map
 * @param {number} height - The height of the map
 * @param {[[{x:number,y:number,delivery:boolean}]]} map - The tiles of the map
 * @param {[[[{x:number,y:number,delivery:boolean}]]]} predictedMap - The predicted tiles of the map
 */
class Map {
    width;
    height;
    map;
    predictedMap;

    /**
     * //TODO: heuristic calculation with BFS
     * @param {[{x:number,y:number,delivery:boolean,parcelSpawner:boolean}]} tiles
     */
    generateMap(tiles) {
        this.map = Array(this.width).fill().map(() => Array(this.height).fill().map(() => new Tile({
            heuristic: Infinity,
            closest_delivery: null
        })));
        tiles.sort((a, b) => (b.delivery - a.delivery));
        let delivery_zones = [];
        tiles.forEach(tile => {
            //console.log(tile);
            let bestDistance = Infinity;
            let closestDelivery = null;
            let currentTile = this.map[tile.x][tile.y];
            if (tile.delivery) {
                delivery_zones.push({x: tile.x, y: tile.y});
            } else {
                delivery_zones.forEach(delivery_zone => {
                    //let distance1 = distance(delivery_zone, tile);
                    let distance1 = this.BFS(tile, delivery_zone).length;
                    if (distance1 < bestDistance) {
                        bestDistance = distance1;
                        closestDelivery = delivery_zone;
                    }
                });
            }
            currentTile.heuristic = bestDistance;
            currentTile.closest_delivery = closestDelivery;
            currentTile.type = tile.parcelSpawner ? 'spawnable' : 'delivery';
        });
    }

    BFS(pos, objective) {
        let steps = [];
        let queue = [];
        let visited = new Array(this.width).fill().map(() => new Array(this.height).fill().map(() => false));
        queue.push(pos);
        visited[pos.x][pos.y] = true;
        let current = null;
        while (queue.length > 0) {
            current = queue.shift();
            if (current.x === objective.x && current.y === objective.y) {
                break;
            }

            //right
            if (current.x + 1 < this.width && !visited[current.x + 1][current.y]) {
                queue.push({x: current.x + 1, y: current.y});
                visited[current.x + 1][current.y] = true;
            }
            //left
            if (current.x - 1 >= 0 && !visited[current.x - 1][current.y]) {
                queue.push({x: current.x - 1, y: current.y});
                visited[current.x - 1][current.y] = true;
            }
            //down
            if (current.y + 1 < this.height && !visited[current.x][current.y + 1]) {
                queue.push({x: current.x, y: current.y + 1});
                visited[current.x][current.y + 1] = true;
            }
            //up
            if (current.y - 1 >= 0 && !visited[current.x][current.y - 1]) {
                queue.push({x: current.x, y: current.y - 1});
                visited[current.x][current.y - 1] = true;
            }
        }

        while (current.x !== pos.x && current.y !== pos.y) {
            steps.push(current);
            for (let i = current.x - 1; i <= current.x + 1; i++) {
                for (let j = current.y - 1; j <= current.y + 1; j++) {
                    if (i < 0 || j < 0 || i >= this.width || j >= this.height) continue;
                    if (visited[i][j] && distance({x: i, y: j}, pos) < distance(current, pos)) {
                        current = {x: i, y: j};
                        break;
                    }
                }
            }
        }
        return steps;
    }

    /**
     * Infers the future state of the map
     */
    async updatePrediction() {
        //TODO
    }

    /**
     *
     * @param {{ width: number, height: number, tiles: [{x:number,y:number,delivery:boolean,parcelSpawner:boolean}]} } mapData
     */
    constructor(mapData) {
        this.width = mapData.width;
        this.height = mapData.height;
        this.generateMap(mapData.tiles);
    }

    /**
     * Updates the map with the new agents and parcels positions
     *
     * @param {Map<string, Agent>} updateAgents
     * @param {Map<string, Parcel>} updateParcels
     */
    async updateMap(updateAgents, updateParcels) {
        for (let [id, agent] of updateAgents) {
            this.map[agent.position.x][agent.position.y].agent = id;
        }
        for (let [id, parcel] of updateParcels) {
            this.map[parcel.position.x][parcel.position.y].parcel = id;
        }
    }
}

/** @type {Map} */
let map = null;

/**
 *
 * @param { { width:number, height:number, tiles:[{x:number,y:number,delivery:boolean,parcelSpawner:boolean}] } } mapData
 */
function createMap(mapData) {
    map = new Map(mapData);
}

/**
 * Updates the map with the new agents and parcels positions
 */
function updateMap() {
    map.updateMap(agents, parcels)
}


export {createMap, map, MAX_FUTURE, updateMap}