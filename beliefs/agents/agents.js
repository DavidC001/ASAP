// TODO imprt from MAPs

const MAX_HISTORY = 5;
const MAX_FUTURE = 10;

//believed intentions
class BelievedIntention {
    //TODO
}

/**
 * @class Agent
 * 
 * @param {[{x:number,y:number}]} position - The position history of the agent
 * 
 */
class Agent {
    position;
    carrying;
    believedIntetion;
    futureMoves;

    /**
     * Infers the agent's information from the given data
     */
    async updatePrediction() {
        //TODO
    }

    /**
     * 
     * @param {{x:number,y:number}} position
     * 
     */
    constructor(position) {
        this.position = [position]; // {x, y}
        this.believedIntetion = new BelievedIntention();
        this.futureMoves = Array(5).fill(position);
        //TODO calculate carrying
        this.updatePosition(position);
    }

    //update the agent's position
    /**
     * Update the agent's position
     * 
     * @param {{x:number,y:number}} newPosition
     *  
     */
    updatePosition(newPosition) {
        this.position.push(newPosition);
        if (this.position.length > 10) {
            this.position.shift();
        }

        this.updatePrediction();
    }

}

/** @type {Map<string, Agent>} */
const Agents = new Map();