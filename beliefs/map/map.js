import {parcels, Parcel} from "../parcels/parcels.js";
import {distance} from "../beliefs.js"
import {agents, Agent} from "../agents/agents.js";

const MAX_FUTURE = 10;

/**
 * @class Tile
 *
 * @property {number} heuristic - The heuristic value of the tile
 * @property {{x:number,y:number}} closest_delivery - The closest delivery zone
 * @property {string} type - The type of the tile between spawnable, delivery and obstacle
 * @property {Agent} agent - The agent on the tile
 * @property {Parcel} parcel - The parcel on the tile
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
 * @property {number} width - The width of the map
 * @property {number} height - The height of the map
 * @property {[[{x:number,y:number,delivery:boolean}]]} map - The tiles of the map
 * @property {[[[{x:number,y:number,delivery:boolean}]]]} predictedMap - The predicted tiles of the map
 */
class Map {
    width;
    height;
    map;
    predictedMap;

    /**
     * Generates the map
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
            let currentTile = this.map[tile.x][tile.y];
            currentTile.type = tile.parcelSpawner ? 'spawnable' : 'delivery';
        });
        tiles.forEach(tile => {
            let bestDistance = Infinity;
            let closestDelivery = null;
            let currentTile = this.map[tile.x][tile.y];
            if (tile.delivery) {
                delivery_zones.push({x: tile.x, y: tile.y});
            } else {
                delivery_zones.forEach(delivery_zone => {
                    let distance1 = this.BFS(tile, delivery_zone);
                    if (distance1.length < bestDistance) {
                        bestDistance = distance1.length;
                        closestDelivery = delivery_zone;
                    }
                });
            }
            currentTile.heuristic = bestDistance;
            currentTile.closest_delivery = closestDelivery;
        });
    }

    BFS(pos, objective) {
        let queue = [];
        let visited = new Array(this.width).fill().map(() => new Array(this.height).fill().map(() => false));
        queue.push([pos]);
        visited[pos.x][pos.y] = true;
        let current = null;
        let node = null;
        let directions = [[0, 1], [0, -1], [1, 0], [-1, 0]]; // up, down, right, left

        while (queue.length > 0) {
            current = queue.shift();
            node = current.at(-1)

            if (node.x === objective.x && node.y === objective.y) {
                return current;
            }

            for (let dir of directions) {
                let newX = node.x + dir[0];
                let newY = node.y + dir[1];
                if ((newX >= 0) && (newX < this.width) && (newY >= 0) && (newY < this.height) && (!visited[newX][newY]) && this.map[newX][newY].type !== 'obstacle') {
                    let newCurrent = JSON.parse(JSON.stringify(current));
                    newCurrent.push({x: newX, y: newY});
                    queue.push(newCurrent);
                    visited[newX][newY] = true;
                }
            }
        }

        // If we don't find a path, return an empty array
        return [];
    }

    /**
     * Infers the future state of the map
     */
    async updatePrediction() {
        //TODO
        this.predictedMap = new Array(MAX_FUTURE).fill(this.map);
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
     */
    async updateMap() {
        for (let [id, agent] of agents) {
            this.map[agent.position.x][agent.position.y].agent = id;
        }
        for (let [id, parcel] of parcels) {
            this.map[parcel.position.x][parcel.position.y].parcel = id;
        }


        await this.updatePrediction();
    }
}

/** @type {Map} */
let map = null;
let visualizer = null;

/**
 *
 * @param { { width:number, height:number, tiles:[{x:number,y:number,delivery:boolean,parcelSpawner:boolean}] } } mapData
 */
function createMap(mapData) {
    map = new Map(mapData);
    setInterval(async () => {
        await map.updateMap();
    },1000);
    visualizer = new MapVisualizer();
}

/**
 * Updates the map with the new agents and parcels positions
 */
async function updateMap() {
    await map.updateMap()
}

import { Window } from 'skia-canvas';

class MapVisualizer {
    win;
    frame;
    frameCount = 0;

    constructor() {
        this.win = new Window(300, 300);
        this.win.title = "Canvas Window";
        console.log(this.win.canvas);
        this.win.on('draw', (e) => {
            if (this.frameCount % 120 === 0) {
                this.drawMap(e);
                //console.log("Drawing map");
            } else {
                e.target.canvas.getContext("2d").putImageData(this.frame, 0, 0);
            }
            this.frameCount++;
        });
    }

    drawMap(e) {
        let ctx = e.target.canvas.getContext("2d")
        let tile_dimensions = 300 / map.width;
        for (let x = 0; x < map.width; x++) {
            for (let y = 0; y < map.height; y++) {
                let tile = map.map[x][y];
                let color = 'black';
                if (tile.type === 'delivery') {
                    color = 'green';
                } else if (tile.type === 'spawnable') {
                    color = 'blue';
                }
                ctx.fillStyle = color;
                ctx.fillRect(x * tile_dimensions, y * tile_dimensions, tile_dimensions, tile_dimensions);

                if (tile.agent) {
                    ctx.fillStyle = 'red';
                    ctx.fillRect(x * tile_dimensions * 4 / 3, y * tile_dimensions * 4 / 3, tile_dimensions / 3 * 2, tile_dimensions / 3 * 2);
                }
                if (tile.parcel) {
                    ctx.fillStyle = 'yellow';
                    ctx.fillRect(x * tile_dimensions * 3 / 2, y * tile_dimensions * 3 / 2, tile_dimensions / 2, tile_dimensions / 2);
                }
            }
        }
        this.frame = ctx.getImageData(0, 0, 300, 300);
    }

}



export {createMap, map, MAX_FUTURE, updateMap}