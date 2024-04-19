/* TODO: - check if we can get only those out of sensing range
*        - delete parcels that are delivered
*        - Make update once every decay interval --> partially done
*/
/**
 * @class parcel
 *
 * @param {{x:number,y:number}} position - The position of the parcel
 * @param {number} score - The score of the parcel
 * @param {string} carried - True if the parcel is carried by the robot
 */
class Parcel {
    position;
    score;
    carried;
    updater;

    /**
     *
     * @param {{x:number,y:number}} position
     * @param {number} score
     * @param {string} carried
     * @param {number} decayInterval
     */
    constructor(position, score, carried, decayInterval) {
        this.position = position; // {x, y}
        this.score = score;
        this.carried = carried;
        this.updater = setInterval(() => {
            if (this.score === 1) {
                clearInterval(this.updater);
            }
            this.score--;
        }, decayInterval);
    }
}

/**
 * @type {Map<string, Parcel>} parcels
 */
const parcels = new Map();


/**
 *
 * @param {[ { id:string, x:number, y:number, carriedBy:string, reward:number } ]} sensedParcels
 * @param {number} decayInterval
 */
function senseParcels(sensedParcels, decayInterval) {
    for (let parcel of sensedParcels) {
        let position = {x: parcel.x, y: parcel.y};
        let score = parcel.reward;
        let carried = parcel.carriedBy;
        let id = parcel.id;
        if (parcels.has(id)) {
            let p = parcels.get(id);
            p.position = position;
            p.score = score;
            p.carried = carried;
        } else {
            parcels.set(id, new Parcel(position, score, carried, decayInterval));
        }
    }

    for (let [id, parcel] of parcels) {
        if (parcel.score === 0) {
            parcels.delete(id);
        }
    }
}

export {parcels, Parcel, senseParcels}