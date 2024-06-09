import { map } from './beliefs/map.js';
import { distance, me } from './beliefs/beliefs.js';
import { parcels } from './beliefs/parcels.js';
import { agents } from './beliefs/agents.js';
import { EventEmitter } from 'events';
import {
    beamSearch,
    deliveryBFS,
    beamPackageSearch,
    pickupAndDeliver,
    exploreBFS2
} from './planner/planner.js';
import { recoverPlan } from './planner/recover.js';
import { DeliverooApi } from '@unitn-asa/deliveroo-js-client';
import myServer from './visualizations/server.js';

//wait console input
import { sendMeInfo, otherAgent, awaitOtherAgent, answerOtherAgent } from './coordination/coordination.js';
import { frozenBFS } from './planner/search_planners.js';

import {
    DASHBOARD,
    MAX_RETRIES,
    HARD_REPLAN_MOVE_INTERVAL,
    SOFT_REPLAN_INTERVAL,
    CHANGE_INTENTION_INTERVAL,
    USE_PDDL,
    INTENTION_REVISION_INTERVAL,
    BASE_PLANNING_TIME, PLANNING_TIME_DECAY,
    STOP_WHILE_PLANNING_INTERVAL,
    PENALITY_RATE_CARRIED_PARCELS,
    BASE_MOVE_SLACK, SLACK_DECAY,
} from './config.js';

/** @type {number} The slack time for the movement added to the movement duration */
let MOVE_SLACK = BASE_MOVE_SLACK;
/** @type {number} The planning time taken by the planner */
let PLANNING_TIME = BASE_PLANNING_TIME;

/** @type {EventEmitter} */
const stopEmitter = new EventEmitter();

/**
 * Calculates the slack time for the movement
 * @param {function} f - The async function to wrap
 * @returns {function} The wrapped function
 */
function moveSlackWrapper(f) {
    return async (...args) => {
        let Stime = new Date().getTime();
        let res = await f(...args);
        let Etime = new Date().getTime();
        let slack = Etime - Stime - me.config.MOVEMENT_DURATION;
        MOVE_SLACK = MOVE_SLACK * SLACK_DECAY + slack * (1 - SLACK_DECAY);
        // console.log('slack', slack, MOVE_SLACK);
        return res;
    }
}

/**
 * Calculates the planning time for the planner
 * @param {function} f - The async function to wrap
 * @returns {function} The wrapped function
 */
function planningTimeWrapper(f) {
    return async (...args) => {
        let Stime = new Date().getTime();
        let res = await f(...args);
        let Etime = new Date().getTime();
        let planning_time = Etime - Stime;
        PLANNING_TIME = PLANNING_TIME * PLANNING_TIME_DECAY + planning_time * (1 - PLANNING_TIME_DECAY);
        // console.log('planning time', planning_time, PLANNING_TIME);
        return res;
    }
}

/**
 * @class Intention
 *
 * @property {{x:number,y:number}} goal - The goal of the intention
 * @property {string|boolean} pickUp - The id of the parcel to pick up, false if the intention is not to pick up a parcel
 * @property {boolean} deliver - True if the intention is to deliver a parcel
 * @property {string} type - The type of the intention
 * @property {boolean} stop - True if the intention has to stop
 * @property {boolean} reached - True if the goal has been reached
 * @property {boolean} started - True if the intention has started
 * @property {Object} planner - Dictionary of the planner functions
 * @property {Object} move - Dictionary of the move functions
 */
class Intention {
    goal;
    type;
    pickUp;
    deliver;
    stop;
    reached;
    started;
    planner = {
        'pickup': planningTimeWrapper(beamPackageSearch),
        'deliver': planningTimeWrapper(deliveryBFS),
        'explore': planningTimeWrapper(exploreBFS2)
    };
    move;

    /**
     * Creates an instance of Intention.
     *
     * @param {{x:number,y:number}} goal - The goal of the intention
     * @param {string|boolean} pickUp - The id of the parcel to pick up, false if the intention is not to pick up a parcel
     * @param {boolean} deliver - True if the intention is to deliver a parcel
     * @param {string} type - The type of the intention
     * @param {DeliverooApi} client - The client to interact with the server
     */
    constructor(goal, pickUp = false, deliver = false, type, client) {
        this.goal = goal;
        this.pickUp = pickUp;
        this.deliver = deliver;
        this.type = type;
        this.stop = false;
        this.reached = false;
        this.started = false;
        this.move = {
            "up": () => moveSlackWrapper(() => client.move("up"))(),
            "down": () => moveSlackWrapper(() => client.move("down"))(),
            "left": () => moveSlackWrapper(() => client.move("left"))(),
            "right": () => moveSlackWrapper(() => client.move("right"))(),
            "pickup": () => new Promise((resolve) => {
                client.pickup().then((res) => {
                    for (let p of res) {
                        carriedParcels.push(p.id);
                    }
                    // console.log('pickup', carriedParcels);
                    sendMeInfo("carriedParcels", carriedParcels);
                    if (!res) res = [];
                    resolve(res);
                });
            }),
            "deliver": () => new Promise((resolve) => {
                client.putdown().then((res) => {
                    if (res.length > 0) {
                        carriedParcels.length = 0;
                    }
                    resolve(res);
                });
            }),
            "none": () => new Promise((resolve) => resolve(true)),
            "fail": () => new Promise((resolve) => resolve(false)),
            "wait": () => new Promise((resolve) => setTimeout(resolve(true), Math.ceil(me.config.MOVEMENT_DURATION * 2))),
            "await": () => new Promise(async (resolve) => {
                await awaitOtherAgent();
                resolve(true)
            }),
            "answer": () => new Promise((resolve) => {
                answerOtherAgent().then();
                resolve(true)
            })
        }
    }

    /**
     * Plans and executes the intention, tries to be resilient to failed moves and can be stopped
     */
    async executeInt() {
        // initialize the variables
        let earlyStop = false;
        this.started = true;
        this.reached = false;

        // if the planning time is too high, maybe I should stop and start again
        let stopWhilePlanning = setInterval(() => {
            if (this.stop) {
                earlyStop = true;
                clearInterval(stopWhilePlanning);
                this.started = false;
                this.stop = false;
                console.log('stopped intention', this.type, "to", (this.type !== "deliver") ? this.goal : "delivery zone");
                stopEmitter.emit('stoppedIntention' + this.type + ' ' + this.goal);
            }
        }, STOP_WHILE_PLANNING_INTERVAL);

        // initial plan
        let plan = await this.planner[this.type](me, this.goal, USE_PDDL);

        // stop the interval
        clearInterval(stopWhilePlanning);
        // if it already stopped, stop the execution
        if (earlyStop) return;

        // if the intention is to explore and the plan is not empty, set the goal to the last tile of the plan
        if (this.type === "explore" && plan.length > 0) {
            this.goal = {
                x: plan[plan.length - 1].x,
                y: plan[plan.length - 1].y
            }
            // update the other agent with my objective, to correctly calculate the utilities
            sendMeInfo("intention", { type: this.type, goal: this.goal });
        }

        // send the plan to the dashboard and to the other agent
        if (DASHBOARD) myServer.emitMessage('intention', { type: this.type, goal: this.goal });
        sendMeInfo("plan", plan);
        if (DASHBOARD) myServer.emitMessage('plan', plan);
        // console.log('\tplan', me.x, me.y, plan);

        //if the intention is to pick up a parcel check if the parcel is still there, maybe I took too long to plan so I should stop
        if (
            this.type === 'pickup'
            && (
                map.map[this.goal.x][this.goal.y].agent !== null    // if an agent is on the same position as the parcel he will pick it up
                || parcels.get(this.pickUp) === undefined           // or if the parcel is not in the map anymore
            )
        ) {
            console.log('\tunreachable goal', this.type, this.goal);
            this.started = false;
            this.reached = true;
            if (this.stop) {
                this.stop = false;
                stopEmitter.emit('stoppedIntention' + this.type + ' ' + this.goal);
            }
            return;
        }

        // initialize the retry count to detect plan failures
        let retryCount = 0;

        // EXECUTE THE PLAN
        for (let i = 0; i < plan.length; i++) {
            // console.log(this.type, 'move', i, plan[i]);
            let res = await this.move[plan[i].move](); // execute the move and wait for the result

            if (!res) {
                // if the move failed, handle the failure

                if (retryCount >= MAX_RETRIES) {
                    // if the retry count is too high, try to recover the plan
                    console.log('\tMax retries exceeded', this.type, "on move", plan[i]);

                    if (this.stop) break; // if the intention has to stop, stop the execution

                    // try to recover the plan
                    plan = await recoverPlan(i, plan, this.type);
                    // console.log('\Recover', this.type, plan);

                    if (plan.length === 0) {
                        // if the plan is empty, the plan has to be replanned from scratch
                        console.log('\tRecover unsuccessful', this.type);
                        plan = await this.planner[this.type](me, this.goal, USE_PDDL);
                        // console.log('replanning', this.type, plan);
                    }

                    i = 0;

                    // send the new plan to the dashboard and to the other agent
                    if (DASHBOARD) myServer.emitMessage('plan', plan);
                    sendMeInfo("plan", plan);
                }

                // if the move failed, retry the move
                i--;
                retryCount++;
            } else {
                // the move was successful, reset the retry count and check if we want to replan

                retryCount = 0; // reset retry count if move was successful

                if (i % HARD_REPLAN_MOVE_INTERVAL === 0 && i > 0) {
                    // if the move is a multiple of the hard replan interval, replan the plan
                    if (this.stop) break;
                    i = -1;

                    // console.log('\tReplanning', this.type);
                    // get the new plan for the same goal
                    plan = await beamPackageSearch(me, this.goal, USE_PDDL);

                    // send the new plan to the dashboard and to the other agent
                    if (DASHBOARD) myServer.emitMessage('plan', plan);
                    sendMeInfo("plan", plan);

                    // console.log('replanning', this.type, plan);
                } else if (i % SOFT_REPLAN_INTERVAL === 0 && i > 0 && plan[i].move !== 'pickup' && plan[i].move !== 'deliver') {
                    // if the move is a multiple of the soft replan interval, replan the plan

                    // console.log('\tSoft replanning', this.type, 'from', plan[i]);

                    // get the new plan for the same goal
                    plan = await beamSearch(plan.splice(i + 1, plan.length), [plan[plan.length - 1]], USE_PDDL);

                    // send the new plan to the dashboard and to the other agent
                    if (DASHBOARD) myServer.emitMessage('plan', plan);
                    sendMeInfo("plan", plan);
                    // console.log('\tSoft replanning', this.type, 'to', plan);

                    i = -1;
                }

                // each CHANGE_INTENTION_INTERVAL moves check if the intention has changed
                if (i % CHANGE_INTENTION_INTERVAL === 0 && i > 0 && this.stop) {
                    break;
                }
            }
        }

        if (this.stop) {
            //if the intention has to stop send a signal
            console.log('stopped intention', this.type, "to", (this.type !== "deliver") ? this.goal : "delivery zone");
            this.stop = false;
            this.started = false;
            stopEmitter.emit('stoppedIntention' + this.type + ' ' + this.goal);
        } else {
            //if the goal has been reached set the reached flag
            console.log('reached goal', this.type, this.goal);
            this.reached = true;
        }
    }

    /**
     * Computes the utility of the intention to pick up a parcel
     * 
     * @param {number} numParcels - The number of carried parcels
     * @param {number} score - The score of the carried parcels
     * @param {number} steps - The number of steps to pick up the parcel
     * 
     * @returns {{score: number, steps: number}} The score and the steps to pick up the parcel
     */
    async pickUpUtility(numParcels, score, steps) {
        let pickedUpParcles = [];

        if (
            map.map[this.goal.x][this.goal.y].agent !== null
            || map.map[this.goal.x][this.goal.y].parcel === null
            || parcels.get(this.pickUp) === undefined
        ) {
            //if an agent is on the same position as the parcel return -1
            score = -1;
        } else {
            //compute the plan to pick up the parcel
            let plan = await beamPackageSearch(me, this.goal, false);

            //compute the number of steps to pick up the parcel and the accumulated score
            for (let move of plan) {
                if (move.move !== 'none' && move.move !== 'pickup') {
                    steps++;
                } else if (move.move === 'pickup') {
                    score += map.map[move.x][move.y].parcel.score;
                    pickedUpParcles.push(map.map[move.x][move.y].parcel.id);
                    numParcels++;
                }
            }

            //check if the goal is unreachable
            if (steps <= 1 && (me.x !== this.goal.x || me.y !== this.goal.y)) {
                //if the goal is unreachable set the score to 0
                score = 0;
            } else {

                //check if another agent is closer and set the score accordingly
                let closer = false;
                let closestAgent = null;
                for (let [id, agent] of agents) {
                    if (agent.id !== me.id && agent.position.x !== -1) {
                        
                        // compute the distance of the other agent to the parcel, be conservative and use the clean BFS
                        let distance_agent = frozenBFS(agent.position, this.goal).length - 1;
                        
                        if (distance_agent < steps && distance_agent > 1 ) {
                            // if the other agent is closer set the score in the interval [0.2, 1]
                            closer = true;
                            
                            // compute the score based on the distance and the parcel score
                            let parcelScore = parcels.get(this.pickUp).score / (me.config.PARCEL_REWARD_AVG + me.config.PARCEL_REWARD_VARIANCE) / 2;
                            let distanceScore = (steps - distance_agent) / (map.width + map.height) * 0.3;
                            score = 0.2 + parcelScore + distanceScore;
                            steps = 0;

                            //if it's the other agent closer, then set the score to 0
                            if (agent.id === otherAgent.id) {
                                score = 0
                                break;
                            }
                            //console.log('\t\tcloser agent', agent.id, 'distance', distance_agent, 'score', score);
                        }
                    }
                }

                //if the other agent is not closer use the clean BFS precalculated heuristic to compute the steps to deliver the parcel
                if (!closer) {
                    steps += map.map[this.goal.x][this.goal.y].heuristic;
                }
            }
        }

        return { score: score, steps: steps, pickedUpParcles: pickedUpParcles };
    }

    /**
     * Computes the utility of the intention
     *
     * @returns {number} the utility of the intention
     */
    async utility() {
        // check if the carried parcels are still valid and compute the carried parcels score
        let toRemove = [];
        //compute the score of the carried parcels
        let score = carriedParcels.reduce((acc, id) => {
            if (parcels.has(id)) {
                return acc + parcels.get(id).score
            } else {
                toRemove.push(id);
                return acc;
            }
        }, 0);
        //remove parcels that are no longer carried
        for (let id of toRemove) {
            carriedParcels.splice(carriedParcels.indexOf(id), 1);
        }

        // compute the number of carried parcels, after removing the invalid ones
        let numParcels = carriedParcels.length;
        let pickedUpParcles = [];
        let steps = 0;
        let utility = 0;
        let penality = 1;

        switch (this.type) {
            case 'pickup':
                penality = PENALITY_RATE_CARRIED_PARCELS;
                let res = await this.pickUpUtility(numParcels, score, steps);
                score = res.score;
                steps = res.steps;
                pickedUpParcles = res.pickedUpParcles;
                break;
            case 'deliver':
                steps = frozenBFS(me, this.goal).length;
                // console.log('deliver', score, numParcels, steps);
                break;
            case 'explore':
                score = 0.1;
                steps = 0;
                break;
            default:
                console.log('Invalid intention type');
        }

        // compute the utility of the intention
        utility =
            score
            - carriedParcels.reduce((acc, id) => {
                if(
                    parcels.get(id).score - 
                    ( 
                        Math.ceil(steps / me.moves_per_parcel_decay) 
                        + Math.ceil(PLANNING_TIME / me.config.PARCEL_DECADING_INTERVAL) * (this.started ? 0 : 1)
                        + Math.ceil(steps * MOVE_SLACK / me.config.PARCEL_DECADING_INTERVAL)
                    ) * penality >= 0
                ){
                    return acc + (
                        Math.ceil(steps / me.moves_per_parcel_decay)
                        + Math.ceil(PLANNING_TIME / me.config.PARCEL_DECADING_INTERVAL) * (this.started ? 0 : 1)
                        + Math.ceil(steps * MOVE_SLACK / me.config.PARCEL_DECADING_INTERVAL)
                    ) * penality
                } else {
                    return acc + parcels.get(id).score;
                }
            }, 0)
            - pickedUpParcles.reduce((acc, id) => {
                if(
                    parcels.get(id).score - 
                    ( 
                        Math.ceil(steps / me.moves_per_parcel_decay) 
                        + Math.ceil(PLANNING_TIME / me.config.PARCEL_DECADING_INTERVAL) * (this.started ? 0 : 1)
                        + Math.ceil(steps * MOVE_SLACK / me.config.PARCEL_DECADING_INTERVAL)
                    ) >= 0
                ){
                    return acc + (
                        Math.ceil(steps / me.moves_per_parcel_decay)
                        + Math.ceil(PLANNING_TIME / me.config.PARCEL_DECADING_INTERVAL) * (this.started ? 0 : 1)
                        + Math.ceil(steps * MOVE_SLACK / me.config.PARCEL_DECADING_INTERVAL)
                    )
                } else {
                    return acc + parcels.get(id).score;
                }
            }, 0)

        return utility;
    }

    /**
     * Stops the intention
     */
    stopInt() {
        this.stop = true;
        //console.log('stopping intention', this.type);
        if (this.reached) {
            this.stop = false;
            this.started = false;
            this.reached = false;
            console.log('stopped intention', this.type, "to", (this.type !== "deliver") ? this.goal : "delivery zone");
            stopEmitter.emit('stoppedIntention' + this.type + ' ' + this.goal);
        }
    }
}

/**
 * @class Intentions
 *
 * @property {Array<Intention>} intentions - The list of intentions
 * @property {Intention} currentIntention - The current intention
 */
class Intentions {
    intentions;
    currentIntention = null;
    waiting = [];

    /**
     * Creates an instance of Intentions.
     */
    constructor() {
        this.intentions = [];
    }

    /**
     * Adds an intention to the list of intentions
     * @param {Intention} intention
     */
    addIntention(intention) {
        this.intentions.push(intention);
    }

    /**
     * Selects the intention with the highest utility and executes it
     */
    async selectIntention() {
        //console.log('intentions', this.intentions);
        // console.log('other agent intention', otherAgent.intention.type, otherAgent.intention.goal)

        //find the intention with the highest utility
        let maxUtility = -Infinity;
        let maxIntention = null;
        for (let intention of this.intentions) {
            let utility = await intention.utility();
            // console.log('\tutility', intention.type, utility);
            if ((
                utility > maxUtility || // if the utility is higher
                (
                    utility === maxUtility
                    && distance(me, intention.goal) < distance(me, maxIntention.goal) 
                ) // or if the utility is the same and the distance is lower
            )
                &&
                (
                    intention.type === 'explore' || intention.type === 'deliver'
                    || intention.goal !== otherAgent.intention.goal
                ) // and if the intantion is not picking up the same parcel as the other agent
            ) {
                //console.log('utility', utility);
                maxUtility = utility;
                maxIntention = intention;
            }
        }

        if (this.currentIntention === null) {
            //if there is no current intention start the one with the highest utility
            console.log("starting intention", maxIntention.type, "to", (maxIntention.type !== "deliver") ? maxIntention.goal : "delivery zone");
            this.currentIntention = maxIntention;
            this.currentIntention.executeInt();
        } else if ((this.currentIntention.goal !== maxIntention.goal && this.currentIntention.started) || this.currentIntention.reached) {
            //if the goal is different from the current intention switch intention
            
            //wait for the current intention to stop before starting the new one
            stopEmitter.once('stoppedIntention' + this.currentIntention.type + ' ' + this.currentIntention.goal, () => {
                console.log("starting intention", maxIntention.type, "to", (maxIntention.type !== "deliver") ? maxIntention.goal : "delivery zone");
                sendMeInfo("intention", { type: maxIntention.type, goal: maxIntention.goal });
                maxIntention.executeInt();
            });

            //stop the current intention
            this.currentIntention.stopInt();
            this.currentIntention = maxIntention;
        }
    }

    /**
     * Generates the base intentions for the agent (deliver and expolore)
     * @param {DeliverooApi} client
     */
    generateIntentions(client) {
        //add deliver intention
        let goal = map.deliveryZones;
        let pickUp = false;
        let deliver = true;
        this.addIntention(new Intention(goal, pickUp, deliver, 'deliver', client));
        //explore intention
        goal = { x: 0, y: 0 };
        pickUp = false;
        deliver = false;
        this.addIntention(new Intention(goal, pickUp, deliver, 'explore', client));
    }

    /**
     * Updates the intentions based on the parcels in the map
     * @param {DeliverooApi} client
     */
    updateIntentions(client) {
        let parcelsIDs = new Map();

        //remove intentions whose parcels have been picked up or expired
        for (let intention of this.intentions) {
            //console.log('old intention', intention);
            if (intention.type === 'pickup') {
                parcelsIDs.set(intention.pickUp, true);
                if (map.map[intention.goal.x][intention.goal.y].agent !== null
                    || parcels.get(intention.pickUp) === undefined
                    || parcels.get(intention.pickUp).carried !== null) {
                    //The parcel has either been picked up or expired
                    this.intentions.splice(this.intentions.indexOf(intention), 1);
                }
            }
        }

        //add intentions for new parcels
        for (let [id, parcel] of parcels) {
            if (!parcelsIDs.has(id) && parcel.carried === null) {
                //Parcel is not in the list of intentions and is not carried
                //console.log('new parcel at', parcel.position, 'id', id);
                let goal = parcel.position;
                let pickUp = id;
                let deliver = false;
                this.addIntention(new Intention(goal, pickUp, deliver, 'pickup', client));
            }
        }

    }
}

/** 
 * List of parcels being currently carried
 * @type {Array<string>} 
 */
const carriedParcels = [];

/** 
 * The intentions of the agent
 * @type {Intentions} 
*/
const intentions = new Intentions();

/**
 * Registers the intention revision functions
 *
 * @param {DeliverooApi} client
 */
function IntentionRevision(client) {
    client.onMap(async () => {
        //wait 0.1 second for the map to be created
        await new Promise((resolve) => setTimeout(resolve, 100));

        //generate the base intentions
        await intentions.generateIntentions(client);
        //update the intentions
        intentions.updateIntentions(client);
        //select the intention to start
        intentions.selectIntention()

        //start the intention revision interval
        setInterval(() => {
            intentions.updateIntentions(client);
            intentions.selectIntention();
        }, INTENTION_REVISION_INTERVAL);
    });
}

export { IntentionRevision };