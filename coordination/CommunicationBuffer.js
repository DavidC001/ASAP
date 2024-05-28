import {DeliverooApi} from "@unitn-asa/deliveroo-js-client";

const MAX_MSG = 200;

class CommunicationBuffer {
    messages = new Array(MAX_MSG);
    writeIndex = 0;
    readIndex = 0;
    

    /**
     * Reads the array with the beliefs in it
     * @returns {Array<string>}
     */
    readBuffer() {
        let readInd = this.readIndex;
        this.readIndex = this.writeIndex;
        // console.log("readBuffer", readInd, this.writeIndex);

        if (readInd <= this.readIndex) {
            return this.messages.slice(readInd, this.readIndex);
        } else {
            return this.messages.slice(readInd, MAX_MSG).concat(this.messages.slice(0, this.readIndex));
        }
    }

    /**
     * Adds a belief to the queue
     * @param {object} belief
     */
    push(belief) {
        this.messages[this.writeIndex] = belief;
        this.writeIndex = (this.writeIndex + 1) % MAX_MSG;
    }
}

export {CommunicationBuffer};