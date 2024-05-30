import {CommunicationBuffer} from "./CommunicationBuffer.js";
import {DeliverooApi} from "@unitn-asa/deliveroo-js-client";
import { Beliefset } from "../planner/pddl-client/index.js";

import myServer from '../server.js';

let client = null;
let AgentRole = 1;

const agentName = process.env.NAME;

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
 * The informations of the other agent
 * @type {{intention: {type: string, goal: {x: number, y: number}}, plan: [{x: number, y: number, move: string}], planBeliefset: Beliefset}} otherAgent
 */
let otherAgent = {
    id: "",
    intention: {
        type: "",
        goal: {x: -1, y: -1}
    },
    plan: [],
    planBeliefset: new Beliefset()
}

/**
 * Handle the message with the intention of the other agent
 * @param {{header: string, content: {object}}} msg
 */
function otherAgentIntention(msg) {
    otherAgent[msg.header] = msg.content;
    if (msg.header === "plan") {
        otherAgent.planBeliefset = new Beliefset();
        for (let move of otherAgent.plan) {
            otherAgent.planBeliefset.declare("collaborator t_"+move.x+"_"+move.y);
        }
        // console.log("other agent plan", otherAgent.plan);
        myServer.emitMessage("otherAgentPlan", otherAgent.plan);
    }
    if (msg.header === "intention") {
        myServer.emitMessage("otherAgentIntention", otherAgent.intention);
    }
}

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
    if (name.includes(agentName)) {
        console.log("handshake with", name, id);
        if (msg === "hello") {
            AgentRole = 0;
            client.shout({header: "handshake", content: "ACK"});
        }
        otherAgent.id = id;
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
    // console.log("new msg received from", name + ':', msg);
    if (msg.header === "handshake") handshake(id, name, msg.content);
    if (id !== otherAgent.id) return;

    if (msg.header === "belief") beliefSharing(msg.content);
    if (msg.header === "intent") otherAgentIntention(msg.content);
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
        if (otherAgent.id !== "") {
            clearInterval(handshake);
        } else {
            client.shout({header: "handshake", content: "hello"});
        }
    }, 1000);
}

/**
 * Send a message to the other agent
 * @param {object}msg The message to send
 * @returns {Promise<void>}
 */
async function sendMsg(msg){
    client.say(otherAgent.id, msg);
}

async function sendRequest(msg){
    client.reply(otherAgent.id, msg);
}


export {coordination, AgentRole, agentBuffer, parcelBuffer, otherAgent, sendMsg};