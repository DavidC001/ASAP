import {CommunicationBuffer} from "./CommunicationBuffer.js";
import {DeliverooApi} from "@unitn-asa/deliveroo-js-client";
import {Beliefset} from "../planner/pddl-client/index.js";

import myServer from '../server.js';

const MAX_REQUEST_TIME = 1000;
const MAX_AWAIT_RETRY = 10;

/**
 * The client to communicate with the other agent
 * @type {DeliverooApi}
 */
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
 * A buffer containing the requests of the other agent
 * @type {CommunicationBuffer}
 */
const requestBuffer = new CommunicationBuffer();

/**
 * The informations of the other agent
 * @type {{id: string, position: {x: number, y: number}, carriedParcels: [string], intention: {type: string, goal: {x: number, y: number}}, plan: [], planBeliefset: Beliefset}}
 */
let otherAgent = {
    id: "",
    position: {x: -1, y: -1},
    carriedParcels: [],
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
function otherAgentInformation(msg) {
    otherAgent[msg.header] = msg.content;
    switch (msg.header) {
        case "position":
            otherAgent.position = msg.content;
            break;
        case msg.header === "plan":
            otherAgent.planBeliefset = new Beliefset();
            for (let move of otherAgent.plan) {
                otherAgent.planBeliefset.declare("collaborator t_" + move.x + "_" + move.y);
            }
            // console.log("other agent plan", otherAgent.plan);
            myServer.emitMessage("otherAgentPlan", otherAgent.plan);
            break;
        case "intention":
            myServer.emitMessage("otherAgentIntention", otherAgent.intention);
            break;
        case "carriedParcels":
            otherAgent.carriedParcels = msg.content;
            break;
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
 * Register the request in the buffer
 * @param {object} msg The message
 * @param {function} replyReq The function to reply to the agent
 */
function registerRequest(msg, replyReq) {
    let replyFun = (msg) => {
        myServer.emitMessage("response", msg);
        return replyReq({header: "requestResponse", content: msg});
    }
    let request = {content: msg, reply: replyFun, timeout: null, expired: false};
    console.log("new request", msg);
    let timeout = setTimeout(() => {
        request.expired = true;
        replyFun("RE-SYNC");
    }, MAX_REQUEST_TIME);
    request.timeout = timeout;
    requestBuffer.push(request);

    myServer.emitMessage("request", ["Received", msg]);
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

    switch (msg.header) {
        case "belief":
            beliefSharing(msg.content);
            break;
        case "agent_info":
            otherAgentInformation(msg.content);
            break;
        case "request":
            registerRequest(msg.content, reply);
            break;
    }
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
async function sendMsg(msg) {
    client.say(otherAgent.id, msg);
}

async function sendRequest(msg) {
    let message = {header: "request", content: msg};
    myServer.emitMessage("request", ["Sent", msg]);
    let response = await new Promise((resolve) => {
        client.ask(otherAgent.id, message).then((res) => {
            resolve(res);
        });
        setTimeout(() => {
            resolve({content: "RE-SYNC"});
        }, MAX_REQUEST_TIME);
    });
    myServer.emitMessage("response", response.content);
    return response.content;
}

async function awaitRequest(){
    let request = [];
    // see if there are requests in the buffer, otherwise wait for maximum 1 second
    for (let i = 0; i < MAX_AWAIT_RETRY; i++) {
        request = requestBuffer.readBuffer();
        if (request.length > 0) {
            break;
        } else {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
    for (let i = 0; i < request.length; i++) {
        clearTimeout(request[i].timeout);
        if (i < request.length - 1 && !request[i].expired) {
            request[i].reply("RE-SYNC");
        }
    }
    request = request[request.length - 1];
    if(!request || request.expired) request = {content: "FAILED"};
    return request;
}

export {coordination, AgentRole, agentBuffer, parcelBuffer, otherAgent, sendMsg, sendRequest, awaitRequest};