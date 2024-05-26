import {CommunicationBuffer} from "../beliefs/belief_sharing.js";
import {DeliverooApi} from "@unitn-asa/deliveroo-js-client";

/**
 * A buffer where you share which agents you have seen
 * @type {CommunicationBuffer}
 */
const agentBuffer = new CommunicationBuffer();

/**
 * A buffer where you share which parcels you have seen
 * @type {CommunicationBuffer}
 */
const parcelBuffer = new CommunicationBuffer();

function coordination(client) {
    client.onMsg((id, name, msg, reply) => {
        console.log("new msg received from", name + ':', msg);
    });
}