import { parcles } from "../parcles/parcles.js";
import { agents } from "../agent/agent.js";

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

module.exports = { createMap, updateMap, map };