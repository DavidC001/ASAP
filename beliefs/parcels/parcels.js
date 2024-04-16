
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

    /**
     *
     * @param {{x:number,y:number}} position
     * @param {number} score
     * @param {string} carried
     */
    constructor( position , score, carried) {
        this.position = position; // {x, y}
        this.score = score;
        this.carried = carried;
    }
}

/**
 * @type {Map<string, Parcel>} parcels
 */
const parcels = new Map();


/**
 * 
 * @param {[ { id:string, x:number, y:number, carriedBy:string, reward:number } ]} sensedParcels
 */
function senseParcels(sensedParcels) {
    //TODO: Check Correctness of implementation
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
            parcels.set(id, new Parcel(position, score, carried));
        }
    }
}


export {
    Parcel,
    parcels,
    senseParcels
}