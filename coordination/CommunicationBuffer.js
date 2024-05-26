import {DeliverooApi} from "@unitn-asa/deliveroo-js-client";

const MAX_BELIEFS = 100;

class CommunicationBuffer {
    beliefs = new Array(MAX_BELIEFS);
    beliefIndex = 0;

    /**
     * Reads the array with the beliefs in it
     * @returns {Array<string>}
     */
    readBeliefs() {
        return this.beliefs;
    }

    /**
     * Adds a belief to the queue
     * @param {object} belief
     */
    addBelief(belief) {
        this.beliefs[this.beliefIndex] = belief;
        this.beliefIndex = (this.beliefIndex + 1) % MAX_BELIEFS;
    }
}

export {CommunicationBuffer};