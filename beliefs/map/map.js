import { parcles } from "../parcles/parcles.js";
import { agents } from "../agent/agent.js";

const MAX_FUTURE = 10;

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
     * 
     * @param {[{x:number,y:number,delivery:boolean}]} tiles 
     */
    async generateMap(tiles) {
        //TODO
    }

    /**
     * Infers the future state of the map
     */
    async updatePrediction() {
        //TODO
    }

    /**
     * 
     * @param { width:number, height:number, tiles:[{x:number,y:number,delivery:boolean}] }} mapData 
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
const map = null;

/**
 * 
 * @param {{ width:number, height:number, tiles:[{x:number,y:number,delivery:boolean}] }} mapData 
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

module.exports = { createMap, updateMap, map, MAX_FUTURE };