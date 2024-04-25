import {parcels, Parcel, parcelEmitter} from "../parcels/parcels.js";
import {me, distance} from "../beliefs.js"
import {agents, Agent} from "../agents/agents.js";
import {EventEmitter} from 'events';
import * as fs from 'node:fs';

const mapEmitter = new EventEmitter();
const MAX_FUTURE = 10;
/**
 * Buffer in which I put the updated actions of my agents and parcels
 * @type {Map<string, Object>}
 */
const actionBuffer = new Map();

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
 * @class Maps
 *
 * @property {number} width - The width of the map
 * @property {number} height - The height of the map
 * @property {[[{x:number,y:number,delivery:boolean}]]} map - The tiles of the map
 * @property {[[[{x:number,y:number,delivery:boolean}]]]} predictedMap - The predicted tiles of the map
 * @property {Map<string, {x:number,y:number}>} currentAgentPosition - The current position of the agents
 * @property {Map<string, {x:number,y:number}>} currentParcelPosition - The current position of the parcels
 */
class Maps {
    width;
    height;
    map;
    predictedMap;
    currentAgentPosition = new Map();
    currentParcelPosition = new Map();

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
    updatePrediction() {
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
    updateMap() {
        //console.log('Updating map');
        let new_map = JSON.parse(JSON.stringify(this.map));
        for (let [id, agent] of agents) {
            // Check that the agent is in the bounds of the map
            if (agent.position.x < 0 || agent.position.y < 0 || agent.position.x >= this.width || agent.position.y >= this.height) {
                console.log('Agent out of bounds');
                continue;
            }
            // If the agent has changed position, update it's current state and remove the previous one from the map
            if (this.currentAgentPosition[id] && ((this.currentAgentPosition[id].x !== agent.position.x) || (this.currentAgentPosition[id].y !== agent.position.y))) {
                new_map[this.currentAgentPosition[id].x][this.currentAgentPosition[id].y].agent = null;
            }
            new_map[agent.position.x][agent.position.y].agent = id;
            this.currentAgentPosition[id] = {x: agent.position.x, y: agent.position.y};
        }

        for (let [id, parcel] of parcels) {
            // Check that the parcel is in the bounds of the map
            if (parcel.position.x < 0 || parcel.position.y < 0 || parcel.position.x >= this.width || parcel.position.y >= this.height) {
                console.log('Parcel out of bounds');
                continue;
            }
            // If a parcel has changed position, update it's current state and remove the previous one from the map
            if (this.currentParcelPosition[id] && (this.currentParcelPosition[id].x !== parcel.position.x || this.currentParcelPosition[id].y !== parcel.position.y)) {
                new_map[this.currentParcelPosition[id].x][this.currentParcelPosition[id].y].parcel = null;
            }
            new_map[parcel.position.x][parcel.position.y].parcel = {
                id: id,
                carried: parcel.carried,
                score: parcel.score
            };
            this.currentParcelPosition[id] = {x: parcel.position.x, y: parcel.position.y};
        }

        for (let [id, action] of actionBuffer) {
            if (action.action === 'delete') {
                new_map[action.position.x][action.position.y][action.type] = null;
            }
        }
        actionBuffer.clear();
        this.map = JSON.parse(JSON.stringify(new_map));
        visualizer.drawMap();
        this.updatePrediction();
    }
}

parcelEmitter.on('deleteParcel', (id) => {
    let temp_position = map.currentParcelPosition[id];
    delete map.currentParcelPosition[id];
    if(temp_position) actionBuffer.set(id, {action: 'delete', type: 'parcel', position: temp_position});
    parcels.delete(id);
});

/** @type {Maps} */
let map = null;
let visualizer = null;
let counter = 0;

/**
 * Create the map from scratch with some initial data and heuristics
 * @param { { width:number, height:number, tiles:[{x:number,y:number,delivery:boolean,parcelSpawner:boolean}] } } mapData
 */
function createMap(mapData) {
    map = new Maps(mapData);
    visualizer = new MapVisualizer();
    setInterval(() => {
        map.updateMap();
    }, me.config.MOVEMENT_DURATION);
}

/**
 * Updates the map with the new agents and parcels positions
 */
function updateMap() {
    map.updateMap()
}

class MapVisualizer {
    file;

    constructor() {
        this.file = './map.txt';
    }

    // Write a function that translate a matrix into a file

    drawMap() {
        let text_map = Array(map.width).fill().map(() => Array(map.height).fill().map(() => ' '));
        for (let x = 0; x < map.width; x++) {
            for (let y = 0; y < map.height; y++) {
                let tile = map.map[x][y];
                let color = '#';
                if (tile.type === 'delivery') {
                    color = '°';
                } else if (tile.type === 'spawnable') {
                    color = '*';
                }

                if (me.x === x && me.y === y) {
                    if (color === '*') color += '';
                    color = 'M';
                }

                if (tile.agent) {
                    if (color === '*') color = '';
                    color += 'A';
                }
                if (tile.parcel) {
                    if (color === '*') color = '';
                    color += 'P';
                }
                // Reverse coordinate to match deliveroo visualization system
                text_map[Math.abs(map.height - y) - 1][Math.abs(map.width - x) - 1] = color;
            }
        }
        text_map = text_map.map(row => row.slice().reverse());
        const data = text_map.map(row => row.join(',')).join('\n');
        fs.writeFile(this.file, data, (err) => {
            if (err) {
                console.error('Error writing file:', err);
            }
        });
    }

}


export {createMap, map, MAX_FUTURE, updateMap}