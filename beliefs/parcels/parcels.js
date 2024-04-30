/* TODO: - check if we can get only those out of sensing range
*        - delete parcels that are delivered
*        - delete parcels that were carried but then we see again the agent that doesn't have them again
*        - update the parcel based on the agent
*        - Make update once every decay interval --> partially done
*/
import {EventEmitter} from 'events';
import {distance, me} from "../beliefs.js";

const parcelEmitter = new EventEmitter();
/**
 * Maps an agent with its carried parcels
 * @type {Map<string, Array<string>>}
 */
const agentsCarrying = new Map();

/**
 * @class parcel
 *
 * @param {{x:number,y:number}} position - The position of the parcel
 * @param {number} score - The score of the parcel
 * @param {string} carried - True if the parcel is carried by the robot
 */
class Parcel {
    id;
    position;
    score;
    carried;
    updater;

    /**
     *
     * @param {string} id
     * @param {{x:number,y:number}} position
     * @param {number} score
     * @param {string} carried
     * @param {number} decayInterval
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
 * @type {Map<string, Parcel>} parcels
 */
const parcels = new Map();

/**
 * Updates the parcels informations when carried by an agent
 * TODO: collect information from the agents
 */
function updateParcels() {

}

/**
 * All the logic to sense the
 * @param {[ { id:string, x:number, y:number, carriedBy:string, reward:number } ]} sensedParcels
 * @param {number} decayInterval
 */
function senseParcels(sensedParcels, decayInterval) {
    let inView = [];
    for (let parcel of sensedParcels) {
        inView.push(parcel.id);
        if (parcel.x % 1 !== 0 || parcel.y % 1 !== 0) continue;
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
        }
    }

    for (let [id, p] of parcels) {
        if (!inView.includes(id) && (distance(p.position, me) < me.config.PARCELS_OBSERVATION_DISTANCE)) {
            parcelEmitter.emit('deleteParcel', id);
        }
    }
}

parcelEmitter.on('deleteParcel', (id) => {
    let p = parcels.get(id);
    if (p.carried) {
        let agent = p.carried;
        let index = agentsCarrying.get(agent).indexOf(id);
        agentsCarrying.get(agent).splice(index, 1);
    }
});

export {parcels, Parcel, senseParcels, parcelEmitter, agentsCarrying}