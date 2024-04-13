
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
 * @param {[ { id:string, x:number, y:number, carriedBy:string, reward:number } ]} parcels 
 */
function senseParcels(parcels) {
    //TODO: Implement this function
}


module.exports = {
    Parcel,
    parcels,
    senseParcels
}