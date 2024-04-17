import {Parcel} from "../parcels/parcels.js";
import {distance} from "../beliefs.js"
//import { agents, Agent} from "../agent/agent.js";

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
                    let distance1 = distance(delivery_zone, tile);
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
     *
     * @param {number} width
     * @param {number} height
     * @param {[{x:number,y:number,delivery:boolean}]} tiles
     */
    updateMap(width, height, tiles) {
        //TODO
    }
}

/** @type {Map} */
let map = null;

/**
 *
 * @param { { width:number, height:number, tiles:[{x:number,y:number,delivery:boolean}] } } mapData
 */
function createMap(mapData) {
    map = new Map(mapData);
}

/**
 *
 * @param {number} width
 * @param {number} height
 * @param {[{x:number,y:number,delivery:boolean}]} tiles
 */
function updateMap(width, height, tiles) {
    //TODO
}

export {createMap, map, MAX_FUTURE}