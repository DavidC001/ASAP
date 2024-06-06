import {map} from './map.js';
import {distance, me} from './beliefs.js';
import {agentsCarrying} from './parcels.js';
import {Beliefset} from "../planner/pddl-client/index.js";
import {DeliverooApi} from "@unitn-asa/deliveroo-js-client";
import {agentBuffer, sendBelief} from "../coordination/coordination.js";
import { frozenBFS } from '../planner/search_planners.js';

import { MAX_FUTURE, MAX_HISTORY, DELETE_UNSEEN_AGENTS_INTERVAL } from '../config.js';

//believed intentions

/**
 * @enum {string}
 */
const intentions = {
    STILL: "STILL",
    MOVE: "MOVE",
    PICK_UP: "PICK_UP",
    DELIVER: "DELIVER"
}

/**
 * @class BelievedIntention
 *
 *
 * @property {string} intention - The believed intention of the agent
 * @property {string} lastMove - The last move of the agent
 * @property {{x:number,y:number}} objective - The objective of the agent
 * @property {[{x:number,y:number}]} futureMoves - The predicted future positions of the agent
 */
class BelievedIntention {
    intention;
    lastMove;
    objective;
    futureMoves;

    /**
     *
     * @param {[{x:number,y:number}]} history
     * @param {boolean} carrying
     * @returns
     */
    constructor(history, carrying) {
        //console.log("predicting intention");
        if (history.length < 2) {
            this.intention = intentions.STILL;
            this.futureMoves = new Array(MAX_FUTURE).fill(history[history.length - 1]);
            //console.log("intention: still")
            return;
        }

        let position = history[history.length - 1];
        let lastPosition = history[history.length - 2];

        // look at the last move of the agent to predict the direction of movement
        if (position.x < lastPosition.x) {
            this.lastMove = "LEFT";
        } else if (position.x > lastPosition.x) {
            this.lastMove = "RIGHT";
        }

        if (position.y < lastPosition.y) {
            this.lastMove = "DOWN";
        } else if (position.y > lastPosition.y) {
            this.lastMove = "UP";
        }

        if (position.x === lastPosition.x && position.y === lastPosition.y) {
            this.lastMove = "NONE";
        }

        //look around the agent, if a parcel is nearby and it moved closer to it, then the intention is to pick up
        let dist = me.config.AGENTS_OBSERVATION_DISTANCE
        for (let i = position.x - dist; i <= position.x + dist; i++) {
            for (let j = position.y - dist; j <= position.y + dist; j++) {
                if (i < 0 || j < 0 || i >= map.width || j >= map.height) continue;
                if (map.map[i][j].parcel) {
                    if (distance(position, map.map[i][j]) < distance(lastPosition, map.map[i][j])
                        && distance(position, map.map[i][j]) < dist) {
                        this.intention = intentions.PICK_UP;
                        if (this.objective !== map.map[i][j]) {
                            this.objective = map.map[i][j];
                            this.goTo(position, this.objective);
                        }
                        //console.log("intention: pick up")
                        return;
                    }
                }
            }
        }

        if (carrying) {
            //if the agent is carrying a parcel then the intention is to deliver
            this.intention = intentions.DELIVER;
            if (this.objective !== map.map[position.x][position.y].closest_delivery) {
                this.objective = map.map[position.x][position.y].closest_delivery
                this.goTo(position, this.objective);
            }
            //console.log("intention: deliver")
        } else {
            //else keep moving in the same direction
            this.intention = intentions.MOVE;
            this.objective = {x: -1, y: -1};
            this.keepMoving(position);
            //console.log("intention: keep moving")
        }
    }

    /**
     * Method to predict the future moves of the agent when the intention is to keep moving
     * @param {{x:number,y:number}} pos - The current position of the agent
     */
    keepMoving(pos) {
        this.futureMoves = [];

        let dx = 0;
        let dy = 0;
        if (this.lastMove === "UP") {
            dy = 1;
        }
        if (this.lastMove === "DOWN") {
            dy = -1;
        }
        if (this.lastMove === "LEFT") {
            dx = -1;
        }

        for (let i = 0; i < MAX_FUTURE; i++) {
            pos = {x: pos.x + dx, y: pos.y + dy};
            if (pos.x < 0 || pos.y < 0 || pos.x >= map.width || pos.y >= map.height) {
                if (this.futureMoves.length > 0) {
                    this.futureMoves.push(
                        this.futureMoves[this.futureMoves.length - 1]
                    );
                } else {
                    this.futureMoves.push({x: pos.x - dx, y: pos.y - dy});
                }
            } else if (map.map[pos.x][pos.y].type === "obstacle") {
                if (this.futureMoves.length > 0) {
                    this.futureMoves.push(
                        this.futureMoves[this.futureMoves.length - 1]
                    );
                } else {
                    this.futureMoves.push({x: pos.x - dx, y: pos.y - dy});
                }
            } else {
                this.futureMoves.push(pos);
            }
            pos = this.futureMoves[this.futureMoves.length - 1];
        }

    }

    /**
     * Method to predict the future moves of the agent when the intention is to go to a specific position
     * @param {{x:number,y:number}} pos - The current position of the agent
     * @param {{x:number,y:number}} obj - The objective position of the agent
     */
    goTo(pos, obj) {
        this.futureMoves = [];
        //TODO: use a more efficient path planner
        let steps = frozenBFS(pos, obj);

        for (let i = 0; i < MAX_FUTURE; i++) {
            if (steps.length === 0) {
                if (this.futureMoves.length > 0) {
                    this.futureMoves.push(
                        this.futureMoves[this.futureMoves.length - 1]
                    );
                } else {
                    this.futureMoves.push(pos);
                }
            } else {
                this.futureMoves.push(
                    steps.shift()
                );
            }
        }
        //if last move is on a delivery then move away from it
        if (map.map[this.futureMoves[this.futureMoves.length - 1].x][this.futureMoves[this.futureMoves.length - 1].y].delivery) {
            if (steps.length > 1) {
                this.futureMoves[this.futureMoves.length - 1] = steps[steps.length - 2];
            } else {
                this.futureMoves[this.futureMoves.length - 1] = pos;
            }
        }
    }

    /**
     * Method to reset the intention to still
     *
     */
    invalidate() {
        this.intention = intentions.STILL;
        this.lastMove = "NONE";
        this.objective = {x: -1, y: -1};
        this.futureMoves = new Array(MAX_FUTURE).fill({x: -1, y: -1});
    }

    /**
     * Method to predict the next position of the agent
     * @returns {{x:number,y:number}} The next position of the agent
     */
    nextStep() {
        let next_pos;
        if (this.futureMoves) {
            next_pos = this.futureMoves[0];
            if (this.futureMoves.length > 1) {
                this.futureMoves.shift();
                this.futureMoves.push(
                    this.futureMoves[this.futureMoves.length - 1]
                );
            }
        } else {
            next_pos = this.objective;
        }
        return next_pos;
    }

}

/**
 * @class Agent
 *
 *
 * @property {{x:number,y:number}} position - The current position of the agent
 * @property {[{x:number,y:number}]} history - The position history of the agent
 * @property {boolean} carrying - True if the agent is carrying a parcel
 * @property {BelievedIntention} believedIntetion - The believed intention of the agent
 * @property {boolean} inView - True if the agent is in the field of view
 * @property {string} id - The id of the agent
 * @property {number} last_seen - The last time the agent was seen
 */
class Agent {
    position;
    history;
    carrying;
    believedIntetion;
    inView;
    id;
    last_seen = 0;

    /**
     *
     * @param {{x:number,y:number}} position - The position history of the agent
     * @param {string} id - The id of the agent
     */
    constructor(position, id) {
        this.id = id;
        this.position = position;
        this.history = [];
        this.inView = true;
        this.carrying = agentsCarrying.has(id).length > 0;
        this.updateHistory(position);
    }

    /**
     * Update the agent's position
     *
     * @param {{x:number,y:number}} newPosition
     *
     */
    updateHistory(newPosition) {
        if (!this.inView) {
            //if the agent reappears in the field of view then reset the history
            this.position = newPosition;
            this.history = [newPosition];
            this.inView = true;
        } else {
            //update the history
            this.history.push(newPosition);
            if (this.history.length > MAX_HISTORY) {
                this.history.shift();
            }
            this.position = newPosition;
        }

        this.carrying = agentsCarrying.has(this.id).length > 0;

        this.believedIntetion = new BelievedIntention(this.history, this.carrying);

        this.last_seen = Date.now();
    }

    /**
     * update the agent's predicted position
     */
    updatePredicted() {
        this.inView = false;
        this.position = this.believedIntetion.nextStep();
        let time = Date.now();
        if (time - this.last_seen > DELETE_UNSEEN_AGENTS_INTERVAL) {
            this.invalidatePrediction();
        }
    }

    /**
     * Method to reset the agent's intention to still
     */
    invalidatePrediction() {
        this.position = {x: -1, y: -1};
        this.believedIntetion.invalidate();
    }
}

/** @type {Map<string, Agent>} */
const agents = new Map();

let agentsBeliefSet;
let futureAgentsBeliefSet;

/**
 * @param {[ { id:string, name:string, x:number, y:number, score:number } ]} sensedAgents
 * @param {DeliverooApi} client
 */
function senseAgents(sensedAgents) {
    //console.log("sensing agents")
    let inView = new Set();
    agentsBeliefSet = new Beliefset();
    futureAgentsBeliefSet = new Beliefset();
    for (const agent of sensedAgents) {
        inView.add(agent.id);
        if (agent.x % 1 !== 0 || agent.y % 1 !== 0) continue;
        if (!agents.has(agent.id)) {
            agents.set(agent.id, new Agent({x: Math.round(agent.x), y: Math.round(agent.y)}, agent.id));
            // console.log("new agent")
        } else {
            agents.get(agent.id).updateHistory({x: Math.round(agent.x), y: Math.round(agent.y)});
            // console.log("updating history")
        }
        sendBelief("agent", {
            id: agent.id,
            position: {x: Math.round(agent.x), y: Math.round(agent.y)},
        });
    }

    let receivedAgents = agentBuffer.readBuffer();
    // console.log("received agents", receivedAgents);
    for (let a of receivedAgents) {
        if(!a || a.id===me.id) continue;

        if (!agents.has(a.id)) agents.set(a.id, new Agent(a.position, a.id));
        else if (!inView.has(a.id)) agents.get(a.id).updateHistory(a.position);
        
        // console.log("agent", a.id, "added to the beliefset");
        inView.add(a.id);
    }

    for (const [id, agent] of agents) {
        if (!inView.has(id)) {
            agent.updatePredicted();
            //if old position is in view then move agent out of bounds
            if (distance(agent.position, me) < me.config.AGENTS_OBSERVATION_DISTANCE - 1) {
                agent.invalidatePrediction();
                // console.log("invalidating prediction")
            }
        }
        //console.log(agent);
        if (agent.position.x > 0 && agent.position.y > 0 && agent.position.x < map.width && agent.position.y < map.height && map.map[agent.position.x][agent.position.y].type !== "obstacle") {
            agentsBeliefSet.declare(`agent t_${agent.position.x}_${agent.position.y}`);
            futureAgentsBeliefSet.declare(`agent t_${agent.position.x}_${agent.position.y} T0`);
        }
        // console.log(agent.believedIntetion.futureMoves);
        for (let [index, move] of agent.believedIntetion.futureMoves.entries()) {
            if (move.x > 0 && move.y > 0 && move.x < map.width && move.y < map.height && map.map[move.x][move.y].type !== "obstacle") {
                futureAgentsBeliefSet.declare(`agent t_${move.x}_${move.y} T${index + 1}`);
            }
        }
    }
}


export {Agent, agents, senseAgents, agentsBeliefSet, futureAgentsBeliefSet}
