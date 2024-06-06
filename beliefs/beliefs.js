import {senseParcels} from "./parcels.js";
import {senseAgents} from "./agents.js";
import {createMap} from "./map.js";
import {DeliverooApi} from "@unitn-asa/deliveroo-js-client";
import { sendMeInfo, sendBelief } from "../coordination/coordination.js";

/**
 * Variables with all the information about myself
 * @type {{
 * id:string,
 * name:string,
 * x:number,
 * y:number,
 * score:number,
 * config:{
 *      MAP_FILE:string,
 *      PARCELS_GENERATION_INTERVAL:string,
 *      PARCELS_MAX:string,
 *      MOVEMENT_STEPS:number,
 *      MOVEMENT_DURATION:number,
 *      AGENTS_OBSERVATION_DISTANCE:number,
 *      PARCELS_OBSERVATION_DISTANCE:number,
 *      AGENT_TIMEOUT:number,
 *      PARCEL_REWARD_AVG:number,
 *      PARCEL_REWARD_VARIANCE:number,
 *      PARCEL_DECADING_INTERVAL:number,
 *      RANDOMLY_MOVING_AGENTS:number,
 *      RANDOM_AGENT_SPEED:string,
 *      CLOCK:number
 * },
 * moves_per_parcel_decay:number}} 
 */
const me = {};

/**
 * Updates the agent information
 *
 * @param {{id:string, name:string, x:number, y:number, score:number}} param0
 */
function updateMe({id, name, x, y, score}) {
    me.id = id;
    me.name = name;
    me.x = Math.round(x);
    me.y = Math.round(y);
    me.score = score;

    // Send the agent information to the other agent
    sendBelief("agent", {
        id: me.id,
        position: {x: me.x, y: me.y},
    });

    sendMeInfo("position", {x: me.x, y: me.y});
}

/**
 * Calculates the Manhattan distance between two points
 *
 * @param {{x:number,y:number}} param0
 * @param {{x:number,y:number}} param1
 *
 * @returns {number} the Manhattan distance between the two points
 */
function distance({x: x1, y: y1}, {x: x2, y: y2}) {
    const dx = Math.abs(Math.round(x1) - Math.round(x2))
    const dy = Math.abs(Math.round(y1) - Math.round(y2))
    return dx + dy;
}


/**
 * Registers the beliefs revision functions
 *
 * @param {DeliverooApi} client
 */
function RegisterBeliefsRevisions(client) {
    client.onYou(updateMe);
    me.config = client.config;

    // compute the decay interval in milliseconds
    let interval = me.config.PARCEL_DECADING_INTERVAL.match(/(\d+)(\w+)/);
    let interval_num = Infinity;
    if (interval !== null) {
        switch (interval[2]) {
            case 'ms':
                interval_num = interval[1];
                break;
            case 's':
                interval_num = interval[1] * 1000;
                break;
            case 'm':
                interval_num = interval[1] * 60 * 1000;
                break;
            case 'infinite':
                interval_num = Infinity;
                break;
            default:
                console.log('Invalid time interval');
        }
    }

    me.config.PARCEL_DECADING_INTERVAL = interval_num;
    me.moves_per_parcel_decay = Math.floor(interval_num / (me.config.MOVEMENT_DURATION));
    //console.log('moves per parcel decay', me.moves_per_parcel_decay);

    // register the function to sense the parcels
    client.onParcelsSensing(async (perceived_parcels) => {
        senseParcels(perceived_parcels, interval_num);
    })

    // register the function to create the map
    client.onMap(async (width, height, tiles) => {
        createMap({width, height, tiles}, client);
    })

    // register the function to sense the agents
    client.onAgentsSensing(async (agents) => {
        senseAgents(agents);
    })
}

export {RegisterBeliefsRevisions, me, distance}