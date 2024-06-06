#!/usr/bin/env node
import {DeliverooApi, timer} from "@unitn-asa/deliveroo-js-client";
import {RegisterBeliefsRevisions} from "./beliefs/beliefs.js";
import {IntentionRevision} from "./agent.js";
import {coordination} from "./coordination/coordination.js";

import {config} from "./config.js";

// Connect to the server
const client = new DeliverooApi(config.host, config.token)
client.onConnect(() => console.log("socket", client.socket.id));
client.onDisconnect(() => console.log("disconnected", client.socket.id));

client.onConfig((config) => {
    // Once the connection is established
    RegisterBeliefsRevisions(client); // Register the listener for the beliefs revision
    IntentionRevision(client); // Register the intention revision logic
    coordination(client); // Register the listener for the coordination with the other agent
})