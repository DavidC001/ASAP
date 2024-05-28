#!/usr/bin/env node
import {DeliverooApi, timer} from "@unitn-asa/deliveroo-js-client";
import {RegisterBeliefsRevisions} from "../beliefs/beliefs.js";
import {IntentionRevision} from "./intentions/intentions.js";
import {coordination} from "../coordination/coordination.js";

import {default as config} from "../config.js";

const client = new DeliverooApi(config.host, config.token)
client.onConnect(() => console.log("socket", client.socket.id));
client.onDisconnect(() => console.log("disconnected", client.socket.id));

client.onConfig((config) => {
    RegisterBeliefsRevisions(client);
    IntentionRevision(client);
    coordination(client);
})