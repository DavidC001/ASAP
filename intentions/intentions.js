import {map} from '../beliefs/map/map.js';
import {distance, me} from '../beliefs/beliefs.js';
import {parcels} from '../beliefs/parcels/parcels.js';
import {agents} from '../beliefs/agents/agents.js';
import {EventEmitter} from 'events';
import {deliveryBFS, beamPackageSearch, exploreBFS, exploreBFS2} from '../planner/planner.js';
import {DeliverooApi} from '@unitn-asa/deliveroo-js-client';

//wait console input
import readline from 'readline';

const input = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const MAX_RETRIES = 1;
const REPLAN_MOVE_INTERVAL = 5;
const stopEmitter = new EventEmitter(); //TODO: make a diffierent emitter for each intention

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

        let planner = {
            'pickup': beamPackageSearch,
            'deliver': deliveryBFS,
            'explore': exploreBFS2,
        }

        this.plan = planner[this.type](me, this.goal);
        //await input from console
        // await new Promise((resolve) => input.question('Press Enter to continue...', resolve));


        // console.log('\tplan', me.x, me.y, this.plan);

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
            if (this.stop) break;

            //console.log(this.type,'move', this.plan[i]);
            let res = await moves[this.plan[i].move]();

            if (!res) {
                //console.log('Move failed, retrying...');
                if (retryCount >= MAX_RETRIES) {
                    // console.log('\tMax retries exceeded', this.type);
                    //wait some moves before replanning
                    await new Promise((resolve) => setTimeout(resolve, me.config.MOVEMENT_DURATION * (Math.floor(Math.random() * 2) + 1)));
                    i = 0;
                    this.plan = planner[this.type](me, this.goal);
                    // console.log('replanning', this.type, this.plan);
                    // await new Promise((resolve) => input.question('Press Enter to continue...', resolve));
                }
                i--;
                retryCount++;
            } else {
                retryCount = 0; // reset retry count if move was successful
                if (i%REPLAN_MOVE_INTERVAL === 0) {
                    i = 0;
                    this.plan = planner[this.type](me, this.goal);
                    // console.log('replanning', this.type, this.plan);
                    // await new Promise((resolve) => input.question('Press Enter to continue...', resolve));
                }
            }
        }

        if (this.stop) {
            //if the intention has to stop send a signal
            //console.log('stopped intention', this.type);
            this.stop = false;
            this.started = false;
            stopEmitter.emit('stoppedIntention');
        } else {
            //if the goal has been reached set the reached flag
            this.reached = true;
        }
    }

    /**
     * Computes the utility of the intention
     *
     * @returns {number} the utility of the intention
     */
    utility() {
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
                    let plan = beamPackageSearch(me, this.goal, 0); //TODO: check if 0 or 1 is better
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
                steps = map.map[me.x][me.y].heuristic;
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
            //console.log('stopped intention', this.type);
            stopEmitter.emit('stoppedIntention');
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
    selectIntention(client) {
        //console.log('intentions', this.intentions);

        //find the intention with the highest utility
        let maxUtility = -Infinity;
        let maxIntention = null;
        for (let intention of this.intentions) {
            let utility = intention.utility();
            //console.log('utility', intention.type, utility);
            if (utility >= maxUtility) {
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
        } else if ((this.currentIntention.goal !== maxIntention.goal || this.currentIntention.reached) && this.currentIntention.started) {
            //if the goal is different from the current intention switch intention
            console.log('switching intention', maxIntention.type, "to", (maxIntention.type !== "deliver") ? maxIntention.goal : "delivery zone", " from", this.currentIntention.type, "to", (this.currentIntention.type !== "deliver") ? this.currentIntention.goal : "delivery zone");

            let oldIntention = this.currentIntention;
            this.currentIntention = maxIntention;

            //wait for the current intention to stop before starting the new one
            stopEmitter.once('stoppedIntention', () => {
                console.log("starting intention", this.currentIntention.type, "to", (this.currentIntention.type !== "deliver") ? this.currentIntention.goal : "delivery zone");
                this.currentIntention.executeInt(client);
            });
            oldIntention.stopInt();
        } else if (this.currentIntention.reached && this.currentIntention.type === 'explore') {
            //if the current intention is explore and the goal has been reached, continue with the next intention
            console.log('continue intention', maxIntention.type);
            this.currentIntention.executeInt(client);
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
        await intentions.generateIntentions();
        setInterval(() => {
            intentions.updateIntentions();
            intentions.selectIntention(client);
        }, 100);
    });
}

export {IntentionRevision};