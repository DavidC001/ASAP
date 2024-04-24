import {senseParcels} from "./parcels/parcels.js";
import {senseAgents} from "./agents/agents.js";
import {createMap} from "./map/map.js";
import {DeliverooApi} from "@unitn-asa/deliveroo-js-client";

/** @type {{id:string, name:string, x:number, y:number, score:number, config:{}, moves_per_parcel_decay:number}} */
const me = {};

/**
 * 
 * @param {{id:string, name:string, x:number, y:number, score:number}} param0 
 */
function updateMe({id, name, x, y, score}) {
    me.id = id;
    me.name = name;
    me.x = x;
    me.y = y;
    me.score = score;
}

/**
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

    let interval = me.config.PARCEL_DECADING_INTERVAL.match(/(\d+)(\w+)/);

    switch (interval[2]) {
        case 'ms':
            interval = interval[1];
            break;
        case 's':
            interval = interval[1] * 1000;
            break;
        case 'm':
            interval = interval[1] * 60 * 1000;
            break;
        default:
            console.log('Invalid time interval');
    }

    me.moves_per_parcel_decay = Math.floor(interval / me.config.MOVEMENT_DURATION);

    client.onParcelsSensing(async (perceived_parcels) => {
        senseParcels(perceived_parcels, interval);
    })

    client.onMap(async (width, height, tiles) => {
        createMap({width, height, tiles});
    })

    client.onAgentsSensing(async (agents) => {
        senseAgents(agents);
    })
}

export {RegisterBeliefsRevisions, me, distance}