import {parcels, parcelEmitter, agentsCarrying} from "./parcels.js";
import {me, distance} from "./beliefs.js"
import {agents} from "./agents.js";

import {Beliefset} from "../planner/pddl-client/index.js";
import myServer from "../visualizations/server.js";
import {otherAgent} from "../coordination/coordination.js";

import {PDDL_cleanBFS} from "../planner/PDDL_planners.js";

import {
    DASHBOARD,
    MAX_AGENT_HEATMAP_DISTANCE, MAX_SPAWNABLE_TILES_DISTANCE, 
    MAX_TIME, MAX_FUTURE, USE_PDDL,
    LAST_SEEN_RESCALE_FACTOR
} from "../config.js";

/**
 * The starting time of the agent
 * @type {number}
 */
let startingTime = Date.now() / 1000;

/**
 * Buffer of parcels to delete
 * @type {[string]}
 */
const deletedParcels = new Array();

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
 * @property {number} probability - The probability of the tile to have a parcel spawn on it
 * @property {number} RegionIndex - The index of the region of the tile
 */
class Tile {
    heuristic;
    closest_delivery;
    type = 'obstacle';
    agent = null;
    parcel = null;
    last_seen = 1;
    agent_heat = 1;
    probability = 0;
    RegionIndex = -1;


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
 * @property {[[Tile]]} map - The tiles of the map
 * @property {[[[Tile]]]} predictedMap - The predicted map of the future
 * @property {[{x:number,y:number}]} deliveryZones - The positions of the delivery zones
 * @property {[{x:number,y:number,last_seen:number,probability:number,RegionIndex:number}]} spawnableTiles - The spawnable tiles
 * @property {Map<string, {x:number,y:number}>} currentAgentPosition - The current position of the agents
 * @property {Map<string, {x:number,y:number}>} currentParcelPosition - The current position of the parcels
 * @property {Beliefset} beliefSet - The beliefset of the map to use in the PDDL planner
 * @property {number} numberOfRegions - The number of regions in the map
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
    numberOfRegions = 0;

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
     * Generates the map given the tiles received from the server
     * @param {[{x:number,y:number,delivery:boolean,parcelSpawner:boolean}]} tiles
     */
    generateMap(tiles) {
        // Create the map with the tiles
        this.map = Array(this.width).fill().map(() => Array(this.height).fill().map(() => new Tile({
            heuristic: Infinity,
            closest_delivery: null
        })));

        // Order the tiles so that the delivery zones are first
        tiles.sort((a, b) => (b.delivery - a.delivery));

        // Compute the heuristic of the tiles
        tiles.forEach(tile => {
            let bestDistance, closestDelivery;
            let currentTile = this.map[tile.x][tile.y];

            if (tile.delivery) {
                // If the tile is a delivery zone, set the heuristic to 0 and the closest delivery to itself
                this.deliveryZones.push({x: tile.x, y: tile.y});
                bestDistance = 0;
                closestDelivery = {x: tile.x, y: tile.y};
                currentTile.type = 'delivery';
            } else {
                // If the tile is not a delivery zone, calculate the heuristic to the closest delivery zone
                let route = this.cleanBFS({x: tile.x, y: tile.y}, this.deliveryZones);
                bestDistance = route.length;
                closestDelivery = route.at(-1);
            }

            // Set the heuristic, the closest delivery and the type of the tile
            currentTile.heuristic = bestDistance;
            currentTile.closest_delivery = closestDelivery;
            currentTile.type = tile.parcelSpawner ? 'spawnable' : 'unspawnable';
            if (tile.delivery) currentTile.type = 'delivery';
            
            // If the tile is a parcel spawner, add it to the spawnable tiles
            if (tile.parcelSpawner) {
                this.spawnableTiles.push({x: tile.x, y: tile.y, last_seen: MAX_TIME + 1});
            }
        });

        // Assign the spawnable tiles to regions and calculate the probability of each to spawn a parcel
        let RegionIndex = 0;

        if ((this.spawnableTiles.length + this.deliveryZones.length) === tiles.length) {

            // If all the tiles are spawnable, set the probability of each to 0
            this.spawnableTiles.forEach(spawnableTile => {
                spawnableTile.probability = 0;
            });

        } else {
            
            // Otherwise, compute the regions and the probability of each tile to spawn a parcel
            this.spawnableTiles.forEach(spawnableTile => {
                // If the tile already has a probability, skip it
                if (spawnableTile.probability !== undefined) return;

                // Otherwise, calculate the region of the tile
                let region = [spawnableTile];
                let minDist = MAX_SPAWNABLE_TILES_DISTANCE;
                this.spawnableTiles.forEach(otherSpawnableTile => {
                    // If the tile already has a probability, skip it
                    if (otherSpawnableTile.probability !== undefined) return;
                    // If the tile is the same as the current one, skip it
                    if (spawnableTile.x === otherSpawnableTile.x && spawnableTile.y === otherSpawnableTile.y) return;

                    // Calculate the distance between the tiles and add the tile to the region if the distance is less than the minimum distance
                    let dist = this.cleanBFS(spawnableTile, [otherSpawnableTile]).length - 1;
                    if (dist <= minDist) {
                        minDist += dist;
                        region.push(otherSpawnableTile);
                    }
                });
                // console.log(region, region.length, this.spawnableTiles.length);
                
                if (region.length === this.spawnableTiles.length) {
                    // If the region contains all the spawnable tiles, set the probability of each to 0
                    region.forEach(tile => {
                        tile.probability = 0;
                    });
                } else {
                    // Compute the probability of each tile in the region and set the region index
                    region.forEach(tile => {
                        tile.probability = region.length / this.spawnableTiles.length;
                        this.map[tile.x][tile.y].probability = tile.probability;
                        tile.RegionIndex = RegionIndex;
                        this.map[tile.x][tile.y].RegionIndex = RegionIndex;
                        // console.log('\tRegionIndex', tile.RegionIndex);
                    });
                    RegionIndex++;
                }
            });
        }

        // Set the total number of regions
        this.numberOfRegions = RegionIndex;

        // Set the beliefset of the map to use in the PDDL planner
        let directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        // Add a belief for each tile that is connected to another tile
        for (let [row, tiles] of this.map.entries()) {
            for (let [column, tile] of tiles.entries()) {
                // For each tile that is not an obstacle, add a belief for each tile that is connected to it
                if (tile.type !== 'obstacle') {
                    // Check the four directions around the tile
                    for (let dir of directions) {
                        let newX = row + dir[0];
                        let newY = column + dir[1];

                        // If the tile is in the bounds of the map and is not an obstacle, add a belief for the connection
                        if ((newX >= 0) && (newX < this.width) && (newY >= 0) && (newY < this.height)
                            && this.map[newX][newY].type !== 'obstacle') {
                            this.beliefSet.declare(`connected t_${row}_${column} t_${newX}_${newY}`);
                        }
                    }
                }
            }
        }
        //console.log(this.spawnableTiles);

        this.updatePrediction();
    }
    
    /**
     * Updates the map with the new agents and parcels positions
     */
    updateMap() {
        //console.log('Updating map');

        // Create a copy of the map to update
        let new_map = JSON.parse(JSON.stringify(this.map));

        // Add the agents to the new map
        for (let [id, agent] of agents) {
            
            // Check that the agent is in the bounds of the map
            if (agent.position.x < 0 || agent.position.y < 0 || agent.position.x >= this.width || agent.position.y >= this.height) {
                // If out of bounds, remove the agent from the current position

                // Check if the agent was in the map
                if (this.currentAgentPosition[id]) {
                    // If the agent was in the map, remove the influence of the agent on the heat map
                    for (let i = Math.max(0, this.currentAgentPosition[id].x - MAX_AGENT_HEATMAP_DISTANCE); i < Math.min(this.width, this.currentAgentPosition[id].x + MAX_AGENT_HEATMAP_DISTANCE); i++) {
                        for (let j = Math.max(0, this.currentAgentPosition[id].y - MAX_AGENT_HEATMAP_DISTANCE); j < Math.min(this.height, this.currentAgentPosition[id].y + MAX_AGENT_HEATMAP_DISTANCE); j++) {
                            if (distance({x: i, y: j}, this.currentAgentPosition[id]) <= MAX_AGENT_HEATMAP_DISTANCE) {
                                new_map[i][j].agent_heat -= 1;
                            }
                        }
                    }

                    // Remove the agent from the map
                    new_map[this.currentAgentPosition[id].x][this.currentAgentPosition[id].y].agent = null;
                    this.currentAgentPosition[id] = null;
                }
                //console.log('Agent out of bounds');
            } else {
                // If the agent is in the bounds of the map, update the agent position
                
                // update the agent heat map
                for (let i = Math.max(0, agent.position.x - MAX_AGENT_HEATMAP_DISTANCE); i < Math.min(this.width, agent.position.x + MAX_AGENT_HEATMAP_DISTANCE); i++) {
                    for (let j = Math.max(0, agent.position.y - MAX_AGENT_HEATMAP_DISTANCE); j < Math.min(this.height, agent.position.y + MAX_AGENT_HEATMAP_DISTANCE); j++) {
                        if (distance({x: i, y: j}, agent.position) <= MAX_AGENT_HEATMAP_DISTANCE) {
                            new_map[i][j].agent_heat += 1;
                        }
                    }
                }

                // If the agent has changed position, update the current position and remove the previous one from the map
                if (this.currentAgentPosition[id]) {

                    // remove the old influence of the agent on the heat map
                    for (let i = Math.max(0, this.currentAgentPosition[id].x - MAX_AGENT_HEATMAP_DISTANCE); i < Math.min(this.width, this.currentAgentPosition[id].x + MAX_AGENT_HEATMAP_DISTANCE); i++) {
                        for (let j = Math.max(0, this.currentAgentPosition[id].y - MAX_AGENT_HEATMAP_DISTANCE); j < Math.min(this.height, this.currentAgentPosition[id].y + MAX_AGENT_HEATMAP_DISTANCE); j++) {
                            if (distance({x: i, y: j}, this.currentAgentPosition[id]) <= MAX_AGENT_HEATMAP_DISTANCE) {
                                new_map[i][j].agent_heat -= 1;
                            }
                        }
                    }

                    // Remove the agent from the previous position
                    if ((this.currentAgentPosition[id].x !== agent.position.x) || (this.currentAgentPosition[id].y !== agent.position.y)) {
                        new_map[this.currentAgentPosition[id].x][this.currentAgentPosition[id].y].agent = null;
                    }
                }

                // Add the agent to the new position
                new_map[agent.position.x][agent.position.y].agent = id;
                this.currentAgentPosition[id] = {x: agent.position.x, y: agent.position.y};
            }
        }

        // Add the parcels to the new map
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

        // Remove the decayed parcels from the map
        for (let id of deletedParcels) {
            if (!this.currentParcelPosition[id]) continue;
            new_map[this.currentParcelPosition[id].x][this.currentParcelPosition[id].y].parcel = null;
            delete this.currentParcelPosition[id];
        }
        deletedParcels.length = 0;

        // Update the map with the new map
        this.map = new_map;
        if ( DASHBOARD) drawMap(this.map);

        // Update the prediction of the map
        this.updatePrediction();
    }

    /**
     * Infers the future state of the map based on the future moves of the agents. Sets the predictedMap
     */
    updatePrediction() {
        // Create a new map to store the future state of the map
        let newMap = new Array(MAX_FUTURE).fill().map(() => new Array(this.width).fill().map(() => new Array(this.height).fill().map(() => {
        })));
        // Copy the current state of the map to the new map
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

        // Update the future state of the map based on the future moves of the agents
        for (let [id, agent] of agents) {
            let first_pos = this.currentAgentPosition[id];
            let pos = first_pos;
            let futureMoves = agent.believedIntetion.futureMoves;
            if (!first_pos) {
                continue;
            }

            // Update the future state of the map based on the future moves of the agent
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

        // Set the predicted map to the new map
        this.predictedMap = newMap;
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

        // Update the last seen of the tiles around the agent in the sensing distance
        let timestamp = Date.now() / 1000;
        for (let i = minX; i <= maxX; i++) {
            for (let j = minY; j <= maxY; j++) {
                if (distance({x: i, y: j}, me) <= parcelObsDist) {
                    this.map[i][j].last_seen = timestamp - startingTime;
                }
            }
        }

        // Update the last seen of the tiles around the other agent in the sensing distance, if there is one
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

        // Rescale the last seen of the tiles if the time is greater than the maximum time  
        if (timestamp - startingTime > MAX_TIME) {
            for (let i = 0; i < this.width; i++) {
                for (let j = 0; j < this.height; j++) {
                    this.map[i][j].last_seen = Math.ceil(this.map[i][j].last_seen * LAST_SEEN_RESCALE_FACTOR);
                }
            }
            // Update the starting time
            startingTime = timestamp - MAX_TIME * LAST_SEEN_RESCALE_FACTOR;
        }
    }

    /**
     * A BFS that doesn't count the agents in its path. This always return a path if there is one, even if there are
     * agents blocking the path
     * @param pos - The starting position
     * @param objectiveList - The objective list of the BFS
     * @param lookUp - A boolean that tells if the plan should be stored in the lookUp
     * @returns {*|*[]} - A path to the objective if possible to reach
     */
    cleanBFS(pos, objectiveList) {
        // initialize the queue and the visited array
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

        // BFS
        while (queue.length > 0) {
            current = queue.shift();
            node = current.at(-1)

            // If one of the objectives is reached, return the path
            for (let goal of objectiveList) {
                if ((node.x === goal.x && node.y === goal.y)) {
                    return current;
                }
            }

            // Check the four directions around the node
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

        // If we don't find a path, return the empty plan
        return [pos];
    }

    /**
     * Precalculates the BFS plans for the map when using the PDDL planner
     */
    async precalculateCleanBFSPlans() {
        //for each spawnable tile, calculate the path to the closest delivery zone and the other spawnable tiles and store them in the planLookUp
        for (let spawnableTile of this.spawnableTiles) {
            // console.log("Calculating BFS for spawnable tile", spawnableTile);
            await PDDL_cleanBFS(spawnableTile, this.deliveryZones, true);
            for (let otherSpawnableTile of this.spawnableTiles) {
                // console.log("Calculating BFS for spawnable tile", spawnableTile, "to", otherSpawnableTile);
                if (otherSpawnableTile.x === spawnableTile.x && otherSpawnableTile.y === spawnableTile.y) continue;
                let goal = [{x: spawnableTile.x, y: otherSpawnableTile.y}]
                await PDDL_cleanBFS(spawnableTile, goal, true);
            }
        }

        //for each delivery tile, calculate the path to the spawnable tiles and store them in the planLookUp
        for (let deliveryTile of this.deliveryZones) {
            // console.log("Calculating BFS for delivery tile", deliveryTile);
            for (let spawnableTile of this.spawnableTiles) {
                let goal = [{x: spawnableTile.x, y: spawnableTile.y}]
                await PDDL_cleanBFS(deliveryTile, goal, true);
            }
        }

    }
}

/**
 * This emitter handles the deletion of the parcels on the map
 */
parcelEmitter.on('deleteParcel', (id) => {
    // signal the deletion of the parcel to the map
    deletedParcels.push(id);
});

/** @type {Maps} */
let map = null;

/**
 * Create the map from scratch with some initial data and heuristics
 * @param { { width:number, height:number, tiles:[{x:number,y:number,delivery:boolean,parcelSpawner:boolean}] } } mapData
 */
function createMap(mapData) {
    // Initialize the map
    map = new Maps(mapData);
    console.log('Map created');
    
    // Precalculate the BFS plans for the PDDL planner
    if (USE_PDDL) map.precalculateCleanBFSPlans();

    // Start the interval to update the map
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
 * Simple helper to visualize the map
 * @param tilemap - The map that we want to save, it can be a normal map or a predictedMap
 */
function drawMap(tilemap) {

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
                if (tile.agent === otherAgent.id) color = 'collaborator';
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
    myServer.emitMessage('map', text_map);
}


export {createMap, map, MAX_FUTURE, updateMap}