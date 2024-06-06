import {EventEmitter} from 'events';
import {distance, me} from "./beliefs.js";
import {Beliefset} from "../planner/pddl-client/index.js";
import {sendBelief, parcelBuffer} from "../coordination/coordination.js";


/**
 * A map accessible to everyone that contains all the sensed parcels
 * @type {Map<string, Parcel>} parcels
 */
const parcels = new Map();

/**
 * Event emitter for the parcels
 * @type {module:events.EventEmitter<DefaultEventMap>}
 */
const parcelEmitter = new EventEmitter();
/**
 * Maps an agent with its carried parcels
 * @type {Map<string, Array<string>>}
 */
const agentsCarrying = new Map();

/**
 * Representation of the parcels with all the important information
 * @class parcel
 *
 * @param {{x:number,y:number}} position - The position of the parcel
 * @param {number} score - The score of the parcel
 * @param {string|null} carried - A string of who is carrying the parcel, null otherwise
 */
class Parcel {
    id;
    position;
    score;
    carried;
    updater;

    /**
     *
     * @param {string} id - The id of the parcel
     * @param {{x:number,y:number}} position - The position of the parcel
     * @param {number} score - The score of the parcel
     * @param {string|null} carried - By whom is carried the parcel, null if none is carrying it
     * @param {number} decayInterval - If the parcel has a decay interval
     */
    constructor(id, position, score, carried, decayInterval) {
        this.id = id;
        this.position = position; // {x, y}
        this.score = score;
        this.carried = carried;
        
        // We update the score of the parcel every decayInterval
        if (decayInterval < Infinity) {
            this.updater = setInterval(() => {
                if (this.score < 1) {
                    // if the score is less than 1 we delete the parcel
                    clearInterval(this.updater);
                    parcelEmitter.emit('deleteParcel', this.id);
                    parcels.delete(this.id);
                } else {
                    this.score--;
                }
            }, decayInterval);
        } else {
            this.updater = null;
        }
    }
}

let parcelsBeliefSet;

/**
 * In this function we sense the parcels and update all the important variables
 * @param {[ { id:string, x:number, y:number, carriedBy:string, reward:number } ]} sensedParcels
 * @param {number} decayInterval
 * @param client
 */
function senseParcels(sensedParcels, decayInterval) {
    let inView = []; // We keep track of the parcels that we see in this iteration
    parcelsBeliefSet = new Beliefset();

    // We update the parcels that we see
    for (let parcel of sensedParcels) {
        inView.push(parcel.id);
        if (parcel.x % 1 !== 0 || parcel.y % 1 !== 0) continue; // We skip intermediate positions

        // get the parcel information
        let position = {x: parcel.x, y: parcel.y};
        let score = parcel.reward;
        let carried = parcel.carriedBy;
        let id = parcel.id;
        
        if (parcels.has(id)) {
            // if the parcel is already in the map we update its information
            let p = parcels.get(id);
            p.position = position;
            p.score = score;
            p.carried = carried;

            if (p.carried) {
                // if the parcel is carried we update the agentsCarrying map as well
                let agents_carrying = agentsCarrying.get(p.carried);

                if (agentsCarrying.has(p.carried) && !agents_carrying.includes(id)) {
                    agents_carrying.push(id);
                } else {
                    agentsCarrying.set(p.carried, [id]);
                }
            }
        } else {
            // if the parcel is not in the map we add it
            parcels.set(id, new Parcel(id, position, score, carried, decayInterval));
        }

        // Send the parcel to the other agent
        sendBelief( "parcel", {
            id: id,
            position: position,
            score: score,
            carried: carried,
            timestamp: Date.now() // used to compute the score when the parcel is received
        });
    }

    //get the parcels the other agent has sent us
    let receivedParcels = parcelBuffer.readBuffer();

    for(let p of receivedParcels){
        if (!p) continue;
        // console.log("parcel", p.id, "received");
        let id = p.id;
        let position = p.position;
        
        // if the parcel is outside of our observation distance we consider it, otherwise we ignore it
        if (distance(position, me) > me.config.PARCELS_OBSERVATION_DISTANCE) {
            let carried = p.carried;
            let timestamp = p.timestamp;
            let score = p.score - Math.floor((Date.now() - timestamp) / decayInterval);

            // add the parcel to the map
            parcels.set(id, new Parcel(id, position, score, carried, decayInterval));
            // console.log("parcel", id, "added");
        }
    }

    // We remove parcels that should be in view but are not, meaning they have been picked up by other agents
    let toDelete = [];
    for (let [id, p] of parcels) {
        if (!inView.includes(id) && (distance(p.position, me) < me.config.PARCELS_OBSERVATION_DISTANCE)) {
            parcelEmitter.emit('deleteParcel', id);
            toDelete.push(id);
            // send the information to the other agent
            sendBelief("parcel", {
                id: id,
                position: p.position,
                score: 0,
                carried: p.carried,
                timestamp: Date.now()
            });
        }

        // We add the parcel to the belief set to be used in the PDDL planner (not used in this version)
        if (p) parcelsBeliefSet.declare(`parcel t_${p.position.x}_${p.position.y}`);
    }

    // We remove the parcels that we have deleted from the map
    for (let id of toDelete) {
        parcels.delete(id);
    }
}

export {parcels, Parcel, senseParcels, parcelEmitter, agentsCarrying, parcelsBeliefSet}