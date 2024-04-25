/* TODO: - check if we can get only those out of sensing range
*        - delete parcels that are delivered
*        - delete parcels that were carried but then we see again the agent that doesn't have them again
*        - update the parcel based on the agent
*        - Make update once every decay interval --> partially done
*        - Add a map that maps the parcels to the agents that are carrying them
*        - What to do when parcels are picked up?
*/
import {EventEmitter} from 'events';
import {distance, me} from "../beliefs.js";

const parcelEmitter = new EventEmitter();

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
        this.updater = setInterval(() => {
            if (this.score === 1) {
                clearInterval(this.updater);
                parcelEmitter.emit('deleteParcel', this.id);
            } else {
                this.score--;
            }
        }, decayInterval);
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
 *
 * @param {[ { id:string, x:number, y:number, carriedBy:string, reward:number } ]} sensedParcels
 * @param {number} decayInterval
 */
function senseParcels(sensedParcels, decayInterval) {
    let inView = [];
    for (let parcel of sensedParcels) {
        if (parcel.x % 1 !== 0 || parcel.y % 1 !== 0) continue;
        let position = {x: parcel.x, y: parcel.y};
        let score = parcel.reward;
        let carried = parcel.carriedBy;
        let id = parcel.id;
        inView.push(id);
        if (parcels.has(id)) {
            let p = parcels.get(id);
            p.position = position;
            p.score = score;
            p.carried = carried;
        } else {
            parcels.set(id, new Parcel(id, position, score, carried, decayInterval));
        }
    }

    for (let [id, p] of parcels) {
        if (!inView.includes(id) && !(distance(p.position, me) >= me.config.PARCELS_OBSERVATION_DISTANCE)) {
            parcelEmitter.emit('deleteParcel', id);
        }
    }


}

export {parcels, Parcel, senseParcels, parcelEmitter}