import { map } from '../beliefs/map/map.js';
import { me } from '../beliefs/beliefs.js';
import { parcels } from '../beliefs/parcels/parcels.js';
import { EventEmitter } from 'events';

const MAX_RETRIES = 5;
const stopEmitter = new EventEmitter();

class Intention {
    goal;
    type;
    pickUp;
    deliver;
    plan;
    stop;
    reached;

    constructor(goal, pickUp=false, deliver=false, type) {
        this.goal = goal;
        this.pickUp = pickUp;
        this.deliver = deliver;
        this.type = type;
        this.plan = [];
        this.stop = false;
        this.reached = false;
    }

    async executeInt(client) { //generate plan
        this.reached = false;
        if(this.deliver) {
            this.goal = map.map[me.x][me.y].closest_delivery;
            console.log('delivering to', this.goal)
            this.plan = map.BFS(me, this.goal)
        } else if(!this.deliver && !this.pickUp){
            this.goal = {x: Math.floor(Math.random() * map.width), y: Math.floor(Math.random() * map.height)};
            console.log('random goal', this.goal);
            this.plan = map.BFS(me, this.goal);
        } else {
            console.log('picking up', this.goal);
            this.plan = map.BFS(me, this.goal);
        }
        console.log('plan', me.x, me.y, this.plan);

        let retryCount = 0;
        for (let i = 0; i < this.plan.length; i++) {
            console.log(this.type,'move', this.plan[i]);
            let res = await client.move(this.plan[i].move);
            if(!res) {
                //console.log('Move failed, retrying...');
                if (retryCount > MAX_RETRIES) {
                    //console.log('Max retries exceeded');
                    i = 0;
                    this.plan = map.BFS(me, this.goal);
                }
                i--;
                retryCount++;
            }else{
                retryCount = 0; // reset retry count if move was successful
            }
            if (this.stop) break;
        }
        if (this.pickUp && !this.stop) {
            let res = await client.pickup();
            //console.log('pickup', res.length);
            if (res.length>0) carriedParcels.push(map.map[this.goal.x][this.goal.y].parcel.id);
        } 
        if (this.deliver && !this.stop) {
            //console.log('deliver');
            await client.putdown();
            //empty carried parcels
            carriedParcels.length = 0;
        }
        if (this.stop) {
            console.log('stopped intention', this.type);
            this.stop = false;
            stopEmitter.emit('stoppedIntention');
        }else{
            this.reached = true;
        }
    }

    utility() {
        if (!this.deliver && !this.pickUp) return 1; //random intention
        //TODO: consider other agents going after them
        let utility = 0;
        if (this.pickUp) {
            //if an agent is on the same position as the parcel return -1
            if (map.map[this.goal.x][this.goal.y].agent !== null
                || map.map[this.goal.x][this.goal.y].parcel === null) {
                utility = -1;
            } else {
                let numParcels = carriedParcels.length + 1;
                let toRemove = []
                let score = map.map[this.goal.x][this.goal.y].parcel.score + carriedParcels.reduce((acc, id) => {
                    if (parcels.has(id)) {
                        return acc + parcels.get(id).score
                    } else {
                        toRemove.push(id); //if parcel is deleted while being carried
                        return acc;
                    }
                }, 0);
                for (let id of toRemove) {
                    carriedParcels.splice(carriedParcels.indexOf(id), 1);
                }
                let steps = map.BFS(me, this.goal).length; //TODO: if too slow use manhattan distance
                utility = score - steps / me.moves_per_parcel_decay * (numParcels) - map.map[this.goal.x][this.goal.y].heuristic * (numParcels)
            }
        } else if (this.deliver) {
            let numParcels = carriedParcels.length;
            let toRemove = []
            let score = carriedParcels.reduce((acc, id) => {
                if (parcels.has(id)) {
                    return acc + parcels.get(id).score
                } else {
                    toRemove.push(id);
                    return acc;
                }
            }, 0);
            for (let id of toRemove) {
                carriedParcels.splice(carriedParcels.indexOf(id), 1);
            }
            let steps = map.map[this.goal.x][this.goal.y].heuristic;
            utility = score - steps / me.moves_per_parcel_decay * (numParcels) - map.map[this.goal.x][this.goal.y].heuristic * (numParcels)   
        }
        return utility;
    }

    stopInt() {
        this.stop = true;
        console.log('stopping intention', this.type);
        if (this.reached) {
            this.stop = false;
            console.log('stopped intention', this.type);
            stopEmitter.emit('stoppedIntention');
        }
    }
}

class Intentions {
    intentions;
    currentIntention = null;

    constructor() {
        this.intentions = [];
    }

    addIntention(intention) {
        this.intentions.push(intention);
    }

    selectIntention(client) {
        //console.log('intentions', this.intentions);
        //find the intention with the highest utility
        let maxUtility = -Infinity;
        let maxIntention = null;
        for (let intention of this.intentions) {
            let utility = intention.utility();
            //console.log('utility of', intention.type, "is", utility);
            if (utility > maxUtility) {
                //console.log('utility', utility);
                maxUtility = utility;
                maxIntention = intention;
            }
        }

        if (this.currentIntention === null) {
            console.log("starting intention", maxIntention.type, "to", maxIntention.goal);
            this.currentIntention = maxIntention;
            this.currentIntention.executeInt(client);
        } else if (this.currentIntention.goal !== maxIntention.goal) {
            console.log('switching intention', maxIntention.type, "to", maxIntention.goal, " from", this.currentIntention.type, "to", this.currentIntention.goal);
            //if goal is not reached
            let oldIntention = this.currentIntention;
            this.currentIntention = maxIntention;
            stopEmitter.once('stoppedIntention', () => {
                console.log("starting intention", maxIntention.type);
                this.currentIntention.executeInt(client);
            });
            oldIntention.stopInt();
        } else if(this.currentIntention.reached && this.currentIntention.type === 'random') {
            console.log('continue intention', maxIntention.type);
            this.currentIntention.executeInt(client);
        }
    }

    generateIntentions() {        
        //add deliver intention
        let goal = {x: 0, y: 0}; 
        let pickUp = false;
        let deliver = true;
        this.addIntention(new Intention(goal, pickUp, deliver, 'deliver'));
        //random goal intention
        pickUp = false;
        deliver = false;
        this.addIntention(new Intention(goal, pickUp, deliver, 'random'));
    }

    updateIntentions() {
        //TODO: remove intentions that are no longer possible and add new intentions

        let parcelsIDs = new Map();

        //remove intentions whose parcels have been picked up or expired
        for (let intention of this.intentions) {
            //console.log('old intention', intention);
            if (intention.pickUp) {
                parcelsIDs.set(intention.pickUp, true);
                if (map.map[intention.goal.x][intention.goal.y].parcel === null) {
                    this.intentions.splice(this.intentions.indexOf(intention), 1);
                } else if (map.map[intention.goal.x][intention.goal.y].parcel.carried !== null) {
                    this.intentions.splice(this.intentions.indexOf(intention), 1);
                }
            }
        }

        //add intentions for new parcels
        for (let [id, parcel] of parcels) {
            if (!parcelsIDs.has(id) && parcel.carried===null) {
                console.log('new parcel at', parcel.position);
                let goal = parcel.position;
                let pickUp = id;
                let deliver = false;
                this.addIntention(new Intention(goal, pickUp, deliver, 'pickup'));
            }
        }

    }
}

const carriedParcels = [];
const intentions = new Intentions();

function IntentionRevision(client) {
    client.onMap(async () => {
        //wait 1 second for the map to be updated
        await new Promise(resolve => setTimeout(resolve, 100));
        intentions.generateIntentions();
        setInterval(() => {
            intentions.updateIntentions();
            intentions.selectIntention(client);
        }, 100);
    });
}

export {IntentionRevision};