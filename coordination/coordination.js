import {CommunicationBuffer} from "./CommunicationBuffer.js";
import {DeliverooApi} from "@unitn-asa/deliveroo-js-client";
import {Beliefset} from "../planner/pddl-client/index.js";

import myServer from '../visualizations/server.js';

import {
    DASHBOARD,
    NAME, 
    MAX_REQUEST_TIME, MAX_AWAIT_RETRY
} from "../config.js";

/**
 * The client to communicate with the other agent
 * @type {DeliverooApi}
 */
let client = null;

/**
 * The role of the agent, being 0 the master and 1 the collaborator
 * @type {number}
 */
let AgentRole = 1;

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

        case "plan":
            otherAgent.planBeliefset = new Beliefset();
            for (let move of otherAgent.plan) {
                otherAgent.planBeliefset.declare("collaborator t_" + move.x + "_" + move.y);
            }
            // console.log("other agent plan", otherAgent.plan);
            if ( DASHBOARD) myServer.emitMessage("otherAgentPlan", otherAgent.plan);
            break;

        case "intention":
            if ( DASHBOARD) myServer.emitMessage("otherAgentIntention", otherAgent.intention);
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

/**
 * Register the received belief in the corresponding buffer
 * @param {{header: string, content: {object}}} msg
 */
function beliefSharing(msg) {
    buffers[msg.header].push(msg.content);
}

/**
 * Handshake function, 
 * who receives the handshake becomes the master
 *
 * @param id
 * @param {string} name The name of the agent
 * @param msg
 */
function handshake(id, name, msg) {
    if (name.includes(NAME)) {
        console.log("handshake with", name, id);
        if (msg === "hello") {
            AgentRole = 0;
            client.shout({header: "handshake", content: "ACK"});
        }
        otherAgent.id = id;
    }
}

/**
 * Routes the request to the right buffer
 * @param {object} msg The message
 * @param {function} replyReq The function to reply to the agent
 */
function registerRequest(msg, replyReq) {

    // create a reply function to show the message in the dashboard
    let replyFun = (msg) => {
        if ( DASHBOARD) myServer.emitMessage("response", msg);
        return replyReq({header: "requestResponse", content: msg});
    }

    // create a request object to store in the buffer
    let request = {content: msg, reply: replyFun, timeout: null, expired: false};
    console.log("new request", msg);

    // set a timeout to the request to avoid infinite waiting
    let timeout = setTimeout(() => {
        request.expired = true;
        replyFun("RE-SYNC");
    }, MAX_REQUEST_TIME);
    request.timeout = timeout;

    // store the request in the buffer
    if (msg === "awaiting") awaitBuffer.push(request);
    else requestBuffer.push(request);

    // show the request in the dashboard
    if ( DASHBOARD) myServer.emitMessage("request", ["Received", msg]);
}

/**
 * Handle the message
 * Routes the message to the right function based on the header
 *
 * @param {string} id The id of the agent
 * @param {string} name The name of the agent
 * @param {{header: string, content: {object}}} msg The message to handle
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
 * Register the listener for the messages
 *
 * @param {DeliverooApi} clientDeliverooApi
 */
function coordination(clientDeliverooApi) {
    client = clientDeliverooApi;
    client.onMsg(handleMsg);

    // send a handshake message every second until the other agent is found
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

/**
 * Send a belief to the other agent
 * 
 * @param {string} type
 * @param {object} msg
 */
async function sendBelief(type, msg) {
    await sendMsg({header: "belief", content: {header: type, content: msg}});
}

/**
 * Send the plan/intention/position of the agent
 * @param {string} type
 * @param {object} msg
 */
async function sendMeInfo(type, msg) {
    await sendMsg({header: "agent_info", content: {header: type, content: msg}});
}

/**
 * Send a request to the other agent
 * @param {object} msg The message to send
 * @returns {Promise<string>} The response of the other agent
 */
async function sendRequest(msg) {
    // create the request message
    let message = {header: "request", content: msg};

    // show the request in the dashboard
    if ( DASHBOARD) myServer.emitMessage("request", ["Sent", msg]);

    // send the request and wait for the response
    let response = await new Promise((resolve) => {
        client.ask(otherAgent.id, message).then((res) => {
            resolve(res);
        });

        // set a timeout to the request to avoid infinite waiting
        setTimeout(() => {
            resolve({content: "RE-SYNC"});
        }, MAX_REQUEST_TIME+100);
    });

    // show the response in the dashboard
    if ( DASHBOARD) myServer.emitMessage("response", response.content);

    return response.content;
}

/**
 * Wait for a request from the other agent
 * 
 * @returns {Promise<{content: string}>}
 */
async function awaitRequest(){
    let request = [];

    // see if there are requests in the buffer, otherwise wait for a bit
    for (let i = 0; i < MAX_AWAIT_RETRY; i++) {
        request = requestBuffer.readBuffer();
        if (request.length > 0) {
            break;
        } else {
            console.log("waiting for request");
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }

    // if there are multiple requests, reply to all but the last one with "RE-SYNC"
    for (let i = 0; i < request.length; i++) {
        clearTimeout(request[i].timeout);
        if (i < request.length - 1 && !request[i].expired) {
            request[i].reply("RE-SYNC");
        }
    }

    // get the last request and return it
    request = request[request.length - 1];
    // if the request is expired or doesn't exist, return a failed request
    if(!request || request.expired) request = {content: "FAILED"};
    return request;
}

/**
 * A buffer to store the awaiting requests
 * @type {CommunicationBuffer}
 */
const awaitBuffer = new CommunicationBuffer();

/**
 * Wait for the clearence to proceed from the other agent
 * @returns {Promise<void>}
 */
async function awaitOtherAgent(){
    await sendRequest("awaiting");
}

/**
 * Answer the other agent that the request is cleared
 * @returns {Promise<void>}
 */
async function answerOtherAgent(){
    let awaiting;

    // see if there are requests in the buffer, otherwise wait for a bit
    for (let i = 0; i < MAX_AWAIT_RETRY; i++){
        awaiting = awaitBuffer.readBuffer();
        if (awaiting.length > 0) {
            break;
        } else {
            console.log("waiting for request");
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }

    // reply to all the requests in the buffer
    for (let waiting of awaiting){
        waiting.reply("answer");
    }
}

export {coordination, AgentRole, agentBuffer, parcelBuffer, otherAgent, sendMsg, sendBelief, sendMeInfo, sendRequest, awaitRequest, awaitOtherAgent, answerOtherAgent};