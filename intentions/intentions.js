import {map} from '../beliefs/map/map.js';
import {distance, me} from '../beliefs/beliefs.js';
import {parcels} from '../beliefs/parcels/parcels.js';
import {agents} from '../beliefs/agents/agents.js';
import {EventEmitter} from 'events';
import {beamSearch, deliveryBFS, beamPackageSearch, exploreBFS, exploreBFS2} from '../planner/planner.js';
import {DeliverooApi} from '@unitn-asa/deliveroo-js-client';
import myServer from '../server.js';

//wait console input
import readline from 'readline';
import { clear } from 'console';

const input = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const MAX_RETRIES = 10;
const MAX_WAIT_FAIL = 8;
const REPLAN_MOVE_INTERVAL = Math.Infinity;
const SOFT_REPLAN_INTERVAL = 2;
const USE_PDDL = false;
const INTENTION_REVISION_INTERVAL = 100;

/** @type {EventEmitter} */
const stopEmitter = new EventEmitter();

/**
 * @class Intention
 *
 * @property {{x:number,y:number}} goal - The goal of the intention
 * @property {string|boolean} pickUp - The id of the parcel to pick up, false if the intention is not to pick up a parcel
 * @property {boolean} deliver - True if the intention is to deliver a parcel
 * @property {string} type - The type of the intention
 * @property {Array<{move:string}>} plan - The plan to reach the goal
 * @property {boolean} stop - True if the intention has to stop
 * @property {boolean} reached - True if the goal has been reached
 * @property {boolean} started - True if the intention has started
 */
class Intention {
    goal;
    type;
    pickUp;
    deliver;
    plan;
    stop;
    reached;
    started;

    /**
     * Creates an instance of Intention.
     *
     * @param {{x:number,y:number}} goal - The goal of the intention
     * @param {string|boolean} pickUp - The id of the parcel to pick up, false if the intention is not to pick up a parcel
     * @param {boolean} deliver - True if the intention is to deliver a parcel
     * @param {string} type - The type of the intention
     */
    constructor(goal, pickUp = false, deliver = false, type) {
        this.goal = goal;
        this.pickUp = pickUp;
        this.deliver = deliver;
        this.type = type;
        this.plan = [];
        this.stop = false;
        this.reached = false;
        this.started = false;
    }

    /**
     * Plans and executes the intention, tries to be resilient to failed moves and can be stopped
     *
     * @param {DeliverooApi} client
     */
    async executeInt(client) {
        this.started = true;
        this.reached = false;

        let stopWhilePlanning = setInterval(() => {
            if (this.stop) {
                clearInterval(stopWhilePlanning);
                this.started = false;
                this.stop = false;
                console.log('stopped intention', this.type, "to", (this.type !== "deliver") ? this.goal : "delivery zone");
                stopEmitter.emit('stoppedIntention'+this.type+' '+this.goal);
            }
        }, 100);

        let planner = {
            'pickup': beamPackageSearch,
            'deliver': deliveryBFS,
            'explore': exploreBFS2
        }

        this.plan = await planner[this.type](me, this.goal, USE_PDDL);
        myServer.emitMessage('plan', this.plan);
        //await input from console
        // await new Promise((resolve) => input.question('Press Enter to continue...', resolve));

        clearInterval(stopWhilePlanning);

        // console.log('\tplan', me.x, me.y, this.plan);

        if (this.type === 'pickup') {
            //if the intention is to pick up a parcel check if the parcel is still there
            if (map.map[this.goal.x][this.goal.y].agent !== null || parcels.get(this.pickUp) === undefined) {
                console.log('\tunreachable goal', this.type, this.goal);
                this.started = false;
                this.reached = true;
                if (this.stop) {
                    this.stop = false;
                    stopEmitter.emit('stoppedIntention'+this.type+' '+this.goal);
                }
                return;
            }
        }

        let moves = {
            "up": () => client.move("up"),
            "down": () => client.move("down"),
            "left": () => client.move("left"),
            "right": () => client.move("right"),
            "pickup": () => new Promise((resolve) => {
                client.pickup().then((res) => {
                    for (let p of res) {
                        carriedParcels.push(p.id);
                    }
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
            "none": () => new Promise((resolve) => resolve(true))
        }

        let retryCount = 0;
        for (let i = 0; i < this.plan.length; i++) {
            // console.log(this.type,'move', i, this.plan[i]);
            let res = await moves[this.plan[i].move]();

            if (!res) {
                // console.log('\tMove failed, retrying...');
                if (retryCount >= MAX_RETRIES) {
                    if (this.stop) break;
                    console.log('\tMax retries exceeded', this.type, "on move", this.plan[i]);
                    //wait some moves before replanning
                    await new Promise((resolve) => setTimeout(resolve, me.config.MOVEMENT_DURATION * (Math.round(Math.random() * MAX_WAIT_FAIL) + 1)));
                    i = 0;
                    this.plan = await planner[this.type](me, this.goal, USE_PDDL);
                    myServer.emitMessage('plan', this.plan);
                    // console.log('replanning', this.type, this.plan);
                    // await new Promise((resolve) => input.question('Press Enter to continue...', resolve));
                }
                i--;
                retryCount++;
            } else {
                // console.log('\tmove ',i, this.plan[i],this.type);
                retryCount = 0; // reset retry count if move was successful
                if (i % REPLAN_MOVE_INTERVAL === 0 && i > 0) {
                    if (this.stop) break;
                    i = -1;
                    // console.log('\tReplanning', this.type);
                    this.plan = await planner[this.type](me, this.goal, USE_PDDL);
                    myServer.emitMessage('plan', this.plan);
                    // console.log('replanning', this.type, this.plan);
                    // await new Promise((resolve) => input.question('Press Enter to continue...', resolve));
                } else if (i % SOFT_REPLAN_INTERVAL === 0 && i > 0 && this.plan[i].move !== 'pickup' && this.plan[i].move !== 'deliver') {
                    // let time = new Date().getTime();
                    // console.log('\tSoft replanning', this.type, 'from', this.plan[i]);
                    this.plan = await beamSearch(this.plan.splice(i + 1, this.plan.length), [this.plan[this.plan.length - 1]], USE_PDDL);
                    myServer.emitMessage('plan', this.plan);
                    // console.log('\tSoft replanning', this.type, 'to', this.plan);
                    i = -1;
                }
            }
        }

        if (this.stop) {
            //if the intention has to stop send a signal
            console.log('stopped intention', this.type, "to", (this.type !== "deliver") ? this.goal : "delivery zone");
            this.stop = false;
            this.started = false;
            stopEmitter.emit('stoppedIntention'+this.type+' '+this.goal);
        } else {
            //if the goal has been reached set the reached flag
            console.log('reached goal', this.type, this.goal);
            this.reached = true;
        }
    }

    /**
     * Computes the utility of the intention
     *
     * @returns {number} the utility of the intention
     */
    async utility() {
        let utility = 0;
        let numParcels = carriedParcels.length;
        let toRemove = []

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

        let steps = 0;
        switch (this.type) {
            case 'pickup':
                //TODO: if carried parcel over limit return -1
                if (map.map[this.goal.x][this.goal.y].agent !== null
                    || map.map[this.goal.x][this.goal.y].parcel === null
                    || parcels.get(this.pickUp) === undefined) {
                    //if an agent is on the same position as the parcel return -1
                    score = -1;
                } else {
                    let plan = await beamPackageSearch(me, this.goal, false);
                    for (let move of plan) {
                        if (move.move !== 'none' && move.move !== 'pickup') {
                            steps++;
                        } else if (move.move === 'pickup') {
                            score += map.map[move.x][move.y].parcel.score;
                            numParcels++;
                        }
                    }
                    if (steps === 0 && (me.x !== this.goal.x || me.y !== this.goal.y)) {
                        score = 0;
                        break;
                    }
                    //console.log('pickup', this.goal, 'steps', steps);

                    //check if another agent is closer and set the score accordingly
                    let closer = false;
                    for (let [id, agent] of agents) {
                        if (agent.id !== me.id && agent.position.x !== -1) {
                            let distance_agent = map.BFS(agent.position, this.goal).length;
                            //console.log('\tagent', agent.id, 'position', agent.position, 'distance', distance_agent);
                            //let distance_agent = distance(agent, this.goal);
                            if (distance_agent < steps) {
                                closer = true;
                                let parcelScore = parcels.get(this.pickUp).score / (me.config.PARCEL_REWARD_AVG + me.config.PARCEL_REWARD_VARIANCE) / 2;
                                let distanceScore = (steps - distance_agent) / (map.width + map.height) * 0.3;
                                score = 0.2 + parcelScore + distanceScore;
                                steps = 0;
                                //console.log('\t\tcloser agent', agent.id, 'distance', distance_agent, 'score', score);
                            }
                        }
                    }
                    if (!closer) {
                        steps += map.map[this.goal.x][this.goal.y].heuristic;
                    }
                }
                break;
            case 'deliver':
                //use the heuristic to the closest delivery point
                steps = map.BFS(me, this.goal).length;
                break;
            case 'explore':
                score = 0.1;
                steps = 0;
                break;
            default:
            //console.log('Invalid intention type');
        }

        utility = score - steps * (numParcels) / me.moves_per_parcel_decay;
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
            stopEmitter.emit('stoppedIntention'+this.type+' '+this.goal);
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
     * @param {DeliverooApi} client
     */
    async selectIntention(client) {
        //console.log('intentions', this.intentions);

        //find the intention with the highest utility
        let maxUtility = -Infinity;
        let maxIntention = null;
        for (let intention of this.intentions) {
            let utility = await intention.utility();
            //console.log('utility', intention.type, utility);
            if (utility > maxUtility || (utility === maxUtility && distance(me, intention.goal) < distance(me, maxIntention.goal))) {
                //console.log('utility', utility);
                maxUtility = utility;
                maxIntention = intention;
            }
        }

        if (this.currentIntention === null) {
            //if there is no current intention start the one with the highest utility
            console.log("starting intention", maxIntention.type, "to", (maxIntention.type !== "deliver") ? maxIntention.goal : "delivery zone");
            this.currentIntention = maxIntention;
            this.currentIntention.executeInt(client);
        } else if ((this.currentIntention.goal !== maxIntention.goal && this.currentIntention.started) || this.currentIntention.reached) {
            //if the goal is different from the current intention switch intention
            // console.log('switching intention', maxIntention.type, "to", (maxIntention.type !== "deliver") ? maxIntention.goal : "delivery zone", " from", this.currentIntention.type, "to", (this.currentIntention.type !== "deliver") ? this.currentIntention.goal : "delivery zone");;
            
            //wait for the current intention to stop before starting the new one
            stopEmitter.once('stoppedIntention'+this.currentIntention.type+' '+this.currentIntention.goal, () => {
                console.log("starting intention", maxIntention.type, "to", (maxIntention.type !== "deliver") ? maxIntention.goal : "delivery zone");
                maxIntention.executeInt(client);
            });
            
            this.currentIntention.stopInt();
            this.currentIntention = maxIntention;
        } 
    }

    /**
     * Generates the base intentions for the agent (deliver and expolore)
     */
    generateIntentions() {
        //add deliver intention
        let goal = map.deliveryZones;
        let pickUp = false;
        let deliver = true;
        this.addIntention(new Intention(goal, pickUp, deliver, 'deliver'));
        //explore intention
        goal = {x: 0, y: 0};
        pickUp = false;
        deliver = false;
        this.addIntention(new Intention(goal, pickUp, deliver, 'explore'));
    }

    /**
     * Updates the intentions based on the parcels in the map
     */
    updateIntentions() {
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
                this.addIntention(new Intention(goal, pickUp, deliver, 'pickup'));
            }
        }

    }
}

/** @type {Array<string>} */
const carriedParcels = [];
/** @type {Intentions} */
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
        await intentions.generateIntentions();
        intentions.updateIntentions();
        intentions.selectIntention(client);
        setInterval(() => {
            intentions.updateIntentions();
            intentions.selectIntention(client);
        }, INTENTION_REVISION_INTERVAL);
    });
}

export {IntentionRevision};