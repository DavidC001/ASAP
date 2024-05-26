import {EventEmitter} from 'events';
import {distance, me} from "../beliefs.js";
import {Beliefset} from "../../planner/pddl-client/index.js";
import {otherAgentID} from "../../coordination/coordination.js";

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
        if (decayInterval < Infinity) {
            this.updater = setInterval(() => {
                if (this.score === 1) {
                    clearInterval(this.updater);
                    parcelEmitter.emit('deleteParcel', this.id);
                } else {
                    this.score--;
                }
            }, decayInterval);
        } else {
            this.updater = null;
        }
    }
}

/**
 * A map accessible to everyone that contains all the sensed parcels
 * @type {Map<string, Parcel>} parcels
 */
const parcels = new Map();

let parcelsBeliefSet;

/**
 * In this function we sense the parcels and update all the important variables
 * @param {[ { id:string, x:number, y:number, carriedBy:string, reward:number } ]} sensedParcels
 * @param {number} decayInterval
 * @param client
 */
function senseParcels(sensedParcels, decayInterval, client) {
    let inView = [];
    parcelsBeliefSet = new Beliefset();
    for (let parcel of sensedParcels) {
        inView.push(parcel.id);
        if (parcel.x % 1 !== 0 || parcel.y % 1 !== 0) continue; // We skip intermediate positions
        let position = {x: parcel.x, y: parcel.y};
        let score = parcel.reward;
        let carried = parcel.carriedBy;
        let id = parcel.id;
        if (parcels.has(id)) {
            let p = parcels.get(id);
            p.position = position;
            p.score = score;
            p.carried = carried;
            if (p.carried) {
                let agents_carrying = agentsCarrying.get(p.carried);
                if (agentsCarrying.has(p.carried) && !agents_carrying.includes(id)) {
                    agents_carrying.push(id);
                } else {
                    agentsCarrying.set(p.carried, [id]);
                }
            }
        } else {
            parcels.set(id, new Parcel(id, position, score, carried, decayInterval));
            client.say(otherAgentID,{
                header: 'beliefs', subheader: 'parcels', payload: {
                    id: id,
                    position: position,
                }
            }).then(() => {});
        }
    }

    // We remove parcels that are no more inView because they are moved by someone else
    for (let [id, p] of parcels) {
        if (!inView.includes(id) && (distance(p.position, me) < me.config.PARCELS_OBSERVATION_DISTANCE)) {
            parcelEmitter.emit('deleteParcel', id);
        }
        if(p) parcelsBeliefSet.declare(`parcel t_${p.position.x}_${p.position.y}`);
    }
}

export {parcels, Parcel, senseParcels, parcelEmitter, agentsCarrying, parcelsBeliefSet}