import {CommunicationBuffer} from "./CommunicationBuffer.js";
import {DeliverooApi} from "@unitn-asa/deliveroo-js-client";

let otherAgentID = "";
let client = null;

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

/**
 * A dictionary with the buffers
 * @type {{agent: CommunicationBuffer, parcel: CommunicationBuffer}}
 */
const buffers = {
    "agent": agentBuffer,
    "parcel": parcelBuffer
}

function beliefSharing(msg) {
    buffers[msg.header].push(msg.content);
}

/**
 * Handshake function
 *
 * @param id
 * @param {string} name The name of the agent
 * @param msg
 */
function handshake(id, name, msg) {
    if (name.includes("FerrariMasterPlan")) {
        console.log("handshake with", name, id);
        if (msg === "hello") client.shout({header: "handshake", content: "ACK"});
        otherAgentID = id;
    }
}

/**
 * Handle the message
 *
 * @param {string} id The id of the agent
 * @param {string} name The name of the agent
 * @param {object} msg The message
 * @param {function} reply The function to reply to the agent
 */
function handleMsg(id, name, msg, reply) {
    console.log("new msg received from", name + ':', msg);
    if (msg.header === "handshake") handshake(id, name, msg.content);
    if (msg.header === "belief") beliefSharing(msg.content);
}

/**
 *
 * @param {DeliverooApi} clientDeliverooApi
 */
function coordination(clientDeliverooApi) {
    client = clientDeliverooApi;
    client.onMsg(handleMsg);
    //wait random time before sending the handshake
    let handshake = setInterval(async () => {
        if (otherAgentID !== "") {
            clearInterval(handshake);
        } else {
            client.shout({header: "handshake", content: "hello"});
        }
    }, 1000);
}


export {coordination, agentBuffer, parcelBuffer, otherAgentID};