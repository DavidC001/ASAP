import {parcels, parcelEmitter, agentsCarrying} from "./parcels.js";
import {me, distance} from "./beliefs.js"
import {agents, Agent} from "./agents.js";
import {DeliverooApi} from "@unitn-asa/deliveroo-js-client";

import {timeTaken} from '../helper.js';

import * as fs from 'node:fs';
import {Beliefset} from "../planner/pddl-client/index.js";
import myserver from "../server.js";
import { otherAgent } from "../coordination/coordination.js";

import { PDDL_cleanBFS } from "../planner/PDDL_planners.js";

/**
 * A variable that sets the maximum prediction of the map
 * @type {number}
 */
const MAX_FUTURE = 2;

const MAX_SPAWNABLE_TILES_DISTANCE = 2.5;
const MAX_AGENT_HEATMAP_DISTANCE = 3;
const MAX_TIME = 500;
let startingTime = Date.now() / 1000;
/**
 * Buffer in which I put the updated actions of my agents and parcels
 * @type {Map<string, Object>}
 */
const actionBuffer = new Map();

/**
 * A tile of the map
 * @class Tile
 *
 * @property {number} heuristic - The heuristic value of the tile
 * @property {{x:number,y:number}} closest_delivery - The closest delivery zone
 * @property {string} type - The type of the tile between spawnable, delivery and obstacle
 * @property {id:string} agent - The id of the agent on the tile
 * @property {{id:string,carried:string,score:number}} parcel - Some information about the parcel on the tile
 * @property {number} last_seen - The last time the tile was seen
 * @property {number} agent_heat - The number of agents that are in the vicinity of the tile
 */
class Tile {
    heuristic;
    closest_delivery;
    type = 'obstacle';
    agent = null;
    parcel = null;
    last_seen = 1;
    agent_heat = 1;


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
 * @property {[{x:number,y:number}]} deliveryZones - The positions of the delivery zones
 * @property {Map<string, {x:number,y:number}>} currentAgentPosition - The current position of the agents
 * @property {Map<string, {x:number,y:number}>} currentParcelPosition - The current position of the parcels
 * @property {Beliefset} beliefSet - The beliefset of the map to use in the PDDL planner
 * @property {Map<string, [{x:number,y:number,move:string}]>} planLookUp - The lookup of the plans
 */
class Maps {
    width;
    height;
    map;
    predictedMap;
    deliveryZones = [];
    spawnableTiles = [];
    currentAgentPosition = new Map();
    currentParcelPosition = new Map();
    beliefSet = new Beliefset();
    planLookUp = new Map();

    /**
     * Generates the map given the tiles received from the server
     * @param {[{x:number,y:number,delivery:boolean,parcelSpawner:boolean}]} tiles
     */
    generateMap(tiles) {
        this.map = Array(this.width).fill().map(() => Array(this.height).fill().map(() => new Tile({
            heuristic: Infinity,
            closest_delivery: null
        })));
        tiles.sort((a, b) => (b.delivery - a.delivery));

        tiles.forEach(tile => {
            let bestDistance, closestDelivery;
            let currentTile = this.map[tile.x][tile.y];
            if (tile.delivery) {
                this.deliveryZones.push({x: tile.x, y: tile.y});
                bestDistance = 0;
                closestDelivery = {x: tile.x, y: tile.y};
                currentTile.type = 'delivery';
            } else {
                let route = this.cleanBFS({x: tile.x, y: tile.y}, this.deliveryZones);
                bestDistance = route.length;
                closestDelivery = route.at(-1);
            }
            currentTile.heuristic = bestDistance;
            currentTile.closest_delivery = closestDelivery;
            currentTile.type = tile.parcelSpawner ? 'spawnable' : 'unspawnable';
            if (tile.delivery) currentTile.type = 'delivery';
            if (tile.parcelSpawner) {
                this.spawnableTiles.push({x: tile.x, y: tile.y, last_seen: MAX_TIME + 1});
            } 
        });

        if ((this.spawnableTiles.length + this.deliveryZones.length) === tiles.length) {
            this.spawnableTiles.forEach(spawnableTile => {
                spawnableTile.probability = 0;
            });
        } else {
            this.spawnableTiles.forEach(spawnableTile => {
                if (spawnableTile.probability !== undefined) return;
                let region = [spawnableTile];
                let minDist = MAX_SPAWNABLE_TILES_DISTANCE;
                this.spawnableTiles.forEach(otherSpawnableTile => {
                    if (otherSpawnableTile.probability !== undefined) return;
                    if (spawnableTile.x === otherSpawnableTile.x && spawnableTile.y === otherSpawnableTile.y) return;
                    let dist = distance(spawnableTile, otherSpawnableTile);
                    if (dist < minDist) {
                        minDist += dist;
                        region.push(otherSpawnableTile);
                    }
                    //console.log('this');
                });
                // console.log(region, region.length, this.spawnableTiles.length);

                if (region.length === this.spawnableTiles.length) {
                    region.forEach(tile => {
                        tile.probability = 0;
                    });
                } else {
                    region.forEach(tile => {
                        tile.probability = region.length / this.spawnableTiles.length;
                    });
                }
            });
        }

        let directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];

        for (let [row, tiles] of this.map.entries()) {
            for (let [column, tile] of tiles.entries()) {
                if (tile.type !== 'obstacle') {
                    for (let dir of directions) {
                        let newX = row + dir[0];
                        let newY = column + dir[1];
                        if ((newX >= 0) && (newX < this.width) && (newY >= 0) && (newY < this.height)
                            && this.map[newX][newY].type !== 'obstacle') {
                            this.beliefSet.declare(`connected t_${row}_${column} t_${newX}_${newY}`);
                        }
                    }
                }
            }
        }
        //console.log(this.spawnableTiles);
    }

    /**
     * A simple BFS that gives the path to the objective. Considers the current map and does count Agents as obstacles
     * @param pos - The starting position
     * @param objective - The objective of the BFS
     * @returns {*|*[]} - A path to the objective if possible to reach
     */
    BFS(pos, objective) {
        let queue = [];
        let visited = new Array(this.width).fill().map(() => new Array(this.height).fill().map(() => false));
        if (pos instanceof Array) queue.push(pos); else queue.push([pos]);
        if (!(objective instanceof Array)) objective = [objective];
        //console.log(this.width, this.height);
        visited[pos.x][pos.y] = true;
        let current = null;
        let node = null;
        let directions = [[[0, 1, 'up'], [0, -1, 'down'], [1, 0, 'right'], [-1, 0, 'left']],
            [[1, 0, 'right'], [-1, 0, 'left'], [0, 1, 'up'], [0, -1, 'down']]];

        //if objective is obstracted, return empty array
        for (let obj of objective) {
            if (this.map[obj.x][obj.y].type === 'obstacle'
                || this.map[obj.x][obj.y].agent !== null) {
                return [];
            }
        }

        while (queue.length > 0) {
            current = queue.shift();
            node = current.at(-1)

            for (let obj of objective) {
                if (node.x === obj.x && node.y === obj.y) {
                    //remove the first element of the array
                    return current;
                }
            }

            for (let dir of directions[current.length % 2]) {
                let newX = node.x + dir[0];
                let newY = node.y + dir[1];
                if ((newX >= 0) && (newX < this.width) && (newY >= 0) && (newY < this.height)
                    && (!visited[newX][newY])
                    && this.map[newX][newY].type !== 'obstacle'
                    && this.map[newX][newY].agent === null) {
                    let newCurrent = JSON.parse(JSON.stringify(current));
                    newCurrent.push({x: newX, y: newY, move: dir[2]});
                    queue.push(newCurrent);
                    visited[newX][newY] = true;
                }
            }
        }

        // If we don't find a path, return an empty array
        return [pos];
    }

    /**
     * A BFS that doesn't count the agents in its path. This always return a path if there is one, even if there are
     * agents blocking the path
     * @param pos - The starting position
     * @param objectiveList - The objective list of the BFS
     * @param lookUp - A boolean that tells if the plan should be stored in the lookUp
     * @returns {*|*[]} - A path to the objective if possible to reach
     */
    cleanBFS(pos, objectiveList, lookUp = false) {
        let key = {"pos": {x: pos.x, y: pos.y}, "objective": objectiveList};
        
        //if the plan is already calculated, return it
        if (this.planLookUp.has(JSON.stringify(key)) && lookUp) {
            let lookUpPlan = this.planLookUp.get(JSON.stringify(key));
            // console.log("\t[CleanBFS] plan found in lookUp");
            return lookUpPlan;
        }

        //otherwise calculate the plan and store it in the lookUp
        let queue = [];
        let visited = new Array(this.width).fill().map(() => new Array(this.height).fill().map(() => false));

        queue.push([{x: pos.x, y: pos.y, move: 'none'}]);

        if (!objectiveList instanceof Array) objectiveList = [objectiveList];

        visited[pos.x][pos.y] = true;
        let current = null;
        let node = null;
        let directions = [[[0, 1, 'up'], [0, -1, 'down'], [1, 0, 'right'], [-1, 0, 'left']],
            [[1, 0, 'right'], [-1, 0, 'left'], [0, 1, 'up'], [0, -1, 'down']]];

        //fiter objectives that are blocked
        objectiveList = objectiveList.filter(objective => {
            return this.map[objective.x][objective.y].type !== 'obstacle';
        });

        while (queue.length > 0) {
            current = queue.shift();
            node = current.at(-1)

            // If the current objective is blocked, I will skip the blocked objective
            for (let goal of objectiveList) {
                if ((node.x === goal.x && node.y === goal.y)) {
                    if (lookUp) this.planLookUp.set(JSON.stringify(key), current);
                    return current;
                }
            }

            for (let dir of directions[current.length % 2]) {
                let newX = node.x + dir[0];
                let newY = node.y + dir[1];
                if ((newX >= 0) && (newX < this.width) && (newY >= 0) && (newY < this.height)
                    && (!visited[newX][newY])
                    && this.map[newX][newY].type !== 'obstacle') {
                    let newCurrent = JSON.parse(JSON.stringify(current));
                    newCurrent.push({x: newX, y: newY, move: dir[2]});
                    queue.push(newCurrent);
                    visited[newX][newY] = true;
                }
            }
        }

        if (lookUp) this.planLookUp.set(JSON.stringify(key), [pos]);

        // If we don't find a path, return an empty array
        return [pos];
    }

    /**
     * Infers the future state of the map based on the future moves of the agents. Sets the predictedMap
     */
    updatePrediction() {
        let newMap = new Array(MAX_FUTURE).fill().map(() => new Array(this.width).fill().map(() => new Array(this.height).fill().map(() => {
        })));
        for (let row = 0; row < this.width; row++) {
            for (let column = 0; column < this.height; column++) {
                for (let i = 0; i < MAX_FUTURE; i++) {
                    let tile = this.map[row][column];
                    newMap[i][row][column] = new Tile({});
                    newMap[i][row][column].type = tile.type;
                    newMap[i][row][column].agent = tile.agent;
                }
            }
        }

        for (let [id, agent] of agents) {
            let first_pos = this.currentAgentPosition[id];
            let pos = first_pos;
            let futureMoves = agent.believedIntetion.futureMoves;
            if (!first_pos) {
                continue;
            }
            for (let i = 0; i < MAX_FUTURE; i++) {
                if (futureMoves[i]) {
                    let futurePos = futureMoves[i];
                    if (futurePos.x < 0 || futurePos.y < 0 || futurePos.x >= this.width || futurePos.y >= this.height) {
                        continue;
                    }
                    if (newMap[i][futurePos.x][futurePos.y].type === 'obstacle') {
                        continue;
                    }
                    if ((first_pos.x !== futurePos.x || first_pos.y !== futurePos.y)) {
                        newMap[i][first_pos.x][first_pos.y].agent = null;
                        newMap[i][futurePos.x][futurePos.y].agent = id;
                    }
                    pos = futurePos;
                }
            }
        }

        /*for (let i in newMap) {
            drawMap(`./map_${i}.txt`, newMap[i])
        }*/
        this.predictedMap = newMap;
    }

    /**
     * Generates the first informations of the map
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
            // Check that the agent is in the bounds of the map and set it to null if it is not
            if (agent.position.x < 0 || agent.position.y < 0 || agent.position.x >= this.width || agent.position.y >= this.height) {
                if (this.currentAgentPosition[id]) {
                    for (let i = Math.max(0, this.currentAgentPosition[id].x - MAX_AGENT_HEATMAP_DISTANCE); i < Math.min(this.width, this.currentAgentPosition[id].x + MAX_AGENT_HEATMAP_DISTANCE); i++) {
                        for (let j = Math.max(0, this.currentAgentPosition[id].y - MAX_AGENT_HEATMAP_DISTANCE); j < Math.min(this.height, this.currentAgentPosition[id].y + MAX_AGENT_HEATMAP_DISTANCE); j++) {
                            if (distance({x: i, y: j}, this.currentAgentPosition[id]) <= MAX_AGENT_HEATMAP_DISTANCE) {
                                new_map[i][j].agent_heat -= 1;
                            }
                        }
                    }

                    new_map[this.currentAgentPosition[id].x][this.currentAgentPosition[id].y].agent = null;
                    this.currentAgentPosition[id] = null;
                }
                //console.log('Agent out of bounds');
            } else {
                // If the agent has changed position, update it's current state and remove the previous one from the map

                // update agent heatmap
                for (let i = Math.max(0, agent.position.x - MAX_AGENT_HEATMAP_DISTANCE); i < Math.min(this.width, agent.position.x + MAX_AGENT_HEATMAP_DISTANCE); i++) {
                    for (let j = Math.max(0, agent.position.y - MAX_AGENT_HEATMAP_DISTANCE); j < Math.min(this.height, agent.position.y + MAX_AGENT_HEATMAP_DISTANCE); j++) {
                        if (distance({x: i, y: j}, agent.position) <= MAX_AGENT_HEATMAP_DISTANCE) {
                            new_map[i][j].agent_heat += 1;
                        }
                    }
                }

                if (this.currentAgentPosition[id]) {
                    for (let i = Math.max(0, this.currentAgentPosition[id].x - MAX_AGENT_HEATMAP_DISTANCE); i < Math.min(this.width, this.currentAgentPosition[id].x + MAX_AGENT_HEATMAP_DISTANCE); i++) {
                        for (let j = Math.max(0, this.currentAgentPosition[id].y - MAX_AGENT_HEATMAP_DISTANCE); j < Math.min(this.height, this.currentAgentPosition[id].y + MAX_AGENT_HEATMAP_DISTANCE); j++) {
                            if (distance({x: i, y: j}, this.currentAgentPosition[id]) <= MAX_AGENT_HEATMAP_DISTANCE) {
                                new_map[i][j].agent_heat -= 1;
                            }
                        }
                    }

                    if ((this.currentAgentPosition[id].x !== agent.position.x) || (this.currentAgentPosition[id].y !== agent.position.y)) {
                        new_map[this.currentAgentPosition[id].x][this.currentAgentPosition[id].y].agent = null;
                    }
                }
                new_map[agent.position.x][agent.position.y].agent = id;
                this.currentAgentPosition[id] = {x: agent.position.x, y: agent.position.y};
            }
        }

        for (let [id, parcel] of parcels) {
            // Check that the parcel is in the bounds of the map
            if (parcel.position.x < 0 || parcel.position.y < 0 || parcel.position.x >= this.width || parcel.position.y >= this.height) {
                //console.log('Parcel out of bounds');
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
        drawMap('./map.txt', this.map);
        this.updatePrediction();
    }

    /**
     * Updates the last seen of the tiles in the map
     */
    updateSenseTime() {
        let parcelObsDist = me.config.PARCELS_OBSERVATION_DISTANCE;
        let maxY = Math.min(me.y + parcelObsDist, this.height - 1);
        let minY = Math.max(me.y - parcelObsDist, 0);
        let maxX = Math.min(me.x + parcelObsDist, this.width - 1);
        let minX = Math.max(me.x - parcelObsDist, 0);

        let timestamp = Date.now() / 1000;
        for (let i = minX; i <= maxX; i++) {
            for (let j = minY; j <= maxY; j++) {
                if (distance({x: i, y: j}, me) <= parcelObsDist) {
                    this.map[i][j].last_seen = timestamp - startingTime;
                }
            }
        }

        if (agents.has(otherAgent.id)) {
            let other_agent = agents.get(otherAgent.id);
            maxX = Math.min(other_agent.position.x + parcelObsDist, this.width - 1);
            maxY = Math.min(other_agent.position.y + parcelObsDist, this.height - 1);
            minX = Math.max(other_agent.position.x - parcelObsDist, 0);
            minY = Math.max(other_agent.position.y - parcelObsDist, 0);
            for (let i = minX; i <= maxX; i++) {
                for (let j = minY; j <= maxY; j++) {
                    if (distance({x: i, y: j}, agents.get(otherAgent.id).position) <= parcelObsDist) {
                        this.map[i][j].last_seen = timestamp - startingTime;
                    }
                }
            }
        }

        if (timestamp - startingTime > MAX_TIME) {
            for (let i = 0; i < this.width; i++) {
                for (let j = 0; j < this.height; j++) {
                    this.map[i][j].last_seen = 1;
                }
            }
            startingTime = timestamp;
        }
    }

    async precalculateCleanBFSPlans(use_PDDL) {
        if (use_PDDL) use_PDDL = "PDDL"; 
        else use_PDDL = "BFS";
        
        let planner = {
            "PDDL": PDDL_cleanBFS, // if use_PDDL is "true" use the PDDL planner
            "BFS": this.cleanBFS // if use_PDDL is "false" use the normal BFS planner
        }
        
        //for each spawnable tile, calculate the path to the closest delivery zone and the other spawnable tiles and store them in the planLookUp
        for (let spawnableTile of this.spawnableTiles) {
            // console.log("Calculating BFS for spawnable tile", spawnableTile);
            await planner[use_PDDL](spawnableTile, this.deliveryZones, true);
            for (let otherSpawnableTile of this.spawnableTiles) {
                // console.log("Calculating BFS for spawnable tile", spawnableTile, "to", otherSpawnableTile);
                if (otherSpawnableTile.x === spawnableTile.x && otherSpawnableTile.y === spawnableTile.y) continue;
                let goal = [{x: spawnableTile.x, y: otherSpawnableTile.y}]
                await planner[use_PDDL](spawnableTile, goal, true);
            }
        }

        //for each delivery tile, calculate the path to the spawnable tiles and store them in the planLookUp
        for (let deliveryTile of this.deliveryZones) {
            // console.log("Calculating BFS for delivery tile", deliveryTile);
            for (let spawnableTile of this.spawnableTiles) {
                let goal = [{x: spawnableTile.x, y: spawnableTile.y}]
                await planner[use_PDDL](deliveryTile, goal, true);
            }
        }
    }
}

/**
 * This emitter handles the deletion of the parcels on the map and in the parcel array
 */
parcelEmitter.on('deleteParcel', (id) => {
    let temp_position = map.currentParcelPosition[id];
    delete map.currentParcelPosition[id];
    if (temp_position) actionBuffer.set(id, {action: 'delete', type: 'parcel', position: temp_position});
    let p = parcels.get(id);
    if (p && p.carried) {
        let agent = p.carried;
        let agent_carrying = agentsCarrying.get(agent);
        if (agent_carrying) {
            let index = agent_carrying.indexOf(id);
            agent_carrying.splice(index, 1);
        }
    }
    parcels.delete(id);
});

/** @type {Maps} */
let map = null;

/**
 * Create the map from scratch with some initial data and heuristics
 * @param { { width:number, height:number, tiles:[{x:number,y:number,delivery:boolean,parcelSpawner:boolean}] } } mapData
 */
function createMap(mapData) {
    map = new Maps(mapData);
    console.log('Map created');
    map.precalculateCleanBFSPlans(process.env.USE_PDDL||false);
    setInterval(() => {
        // timeTaken(updateMap);
        updateMap();
        map.updateSenseTime();
    }, me.config.MOVEMENT_DURATION);
}

/**
 * Updates the map with the new agents and parcels positions
 */
function updateMap() {
    map.updateMap()
}

/**
 * Simple helper to visualize the map on a simple text file
 * @param filename - The filename to save to
 * @param tilemap - The map that we want to save, it can be a normal map or a predictedMap
 */
function drawMap(filename, tilemap) {
    let text_map = Array(map.width).fill().map(() => Array(map.height).fill().map(() => ' '));
    for (let x = 0; x < map.width; x++) {
        for (let y = 0; y < map.height; y++) {
            let tile = tilemap[x][y];
            let color = tile.type;

            if (me.x === x && me.y === y) {
                color = 'me';
            }

            if (tile.agent) {
                color = 'agent';
                if (tile.agent === otherAgent.id)  color = 'collaborator';
            }
            if (tile.parcel) {
                color = 'parcel';
            }
            // Reverse coordinate to match deliveroo visualization system
            text_map[Math.abs(map.height - y) - 1][Math.abs(map.width - x) - 1] = {
                type: color, score: tile.parcel ? tile.parcel.score : null,
                heat: tile.agent_heat, last_seen: tile.last_seen
            };
        }
    }
    text_map = text_map.map(row => row.slice().reverse());
    // const data = text_map.map(row => row.join(',')).join('\n');
    // fs.writeFile(filename, data, (err) => {
    //     if (err) {
    //         console.error('Error writing file:', err);
    //     }
    // });
    myserver.emitMessage('map', text_map);
}


export {createMap, map, MAX_FUTURE, updateMap}