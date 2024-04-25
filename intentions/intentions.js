import { map } from '../beliefs/map/map.js';
import { me } from '../beliefs/beliefs.js';
import { parcels } from '../beliefs/parcels/parcels.js';

class Intention {
    goal;
    pickUp;
    deliver;
    plan = [];
    stop = false;

    constructor(goal, pickUp=false, deliver=false) {
        this.goal = goal;
        this.pickUp = pickUp;
        this.deliver = deliver;

        //TODO: use a better planner
        this.plan = map.BFS(me, this.goal);
    }

    async executeInt(client) { //generate plan
        for (let i = 0; i < this.plan.length; i++) {
            //await this.plan[i].execute(); //TODO: handle plan failure
            console.log('move', this.plan[i].move);
            await client.move(this.plan[i].move);
            if (this.stop) {
                break;
            }
        }
        if (this.pickUp) {
            console.log('pickup');
            let res = await client.pickup();
            if (res) carriedParcels.push(map.map[this.goal.x][this.goal.y].parcel);
        } else if (this.deliver) {
            console.log('putdown');
            await client.putdown();
            carriedParcels.pop();
        }
    }

    utility() {
        //TODO: consider other agents going after them
        let utility = 0;
        if (this.pickUp) {
            if (map.map[this.goal.x][this.goal.y].parcel === null) {
                utility = -1;
            } else {
                let numParcels = carriedParcels.length + 1;
                let score = map.map[this.goal.x][this.goal.y].parcel.score + carriedParcels.reduce((acc, parcel) => acc + parcel.score, 0);
                let steps = map.BFS(me, this.goal).length; //TODO: if too slow use manhattan distance
                utility = score - steps / me.moves_per_parcel_decay * (numParcels) - map.map[this.goal.x][this.goal.y].heuristic * (numParcels)
            }
        } else if (this.deliver) {
            let numParcels = carriedParcels.length;
            let score = carriedParcels.reduce((acc, parcel) => acc + parcel.score, 0);
            let steps = map.map[this.goal.x][this.goal.y].heuristic;
            utility = score - steps / me.moves_per_parcel_decay * (numParcels) - map.map[this.goal.x][this.goal.y].heuristic * (numParcels)   
        }
        return utility;
    }

    stopInt() {
        this.stop = true;
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
        //find the intention with the highest utility
        let maxUtility = -Infinity;
        let maxIntention = null;
        for (let intention of this.intentions) {
            let utility = intention.utility();
            if (utility > maxUtility) {
                //console.log('utility', utility);
                maxUtility = utility;
                maxIntention = intention;
            }
        }

        if (this.currentIntention === null) {
            console.log("starting intention", maxIntention);
            this.currentIntention = maxIntention;
            this.currentIntention.executeInt(client);
        } else if (this.currentIntention.goal !== maxIntention.goal) {
            console.log('switching intention');
            console.log(maxIntention);
            this.currentIntention.stopInt();
            this.currentIntention = maxIntention;
            this.currentIntention.executeInt(client);
        }
    }

    generateIntentions() {        
        //add deliver intention
        let goal = {x: 0, y: 0}; //TODO: find the best place to deliver
        let pickUp = false;
        let deliver = true;
        this.addIntention(new Intention(goal, pickUp, deliver));
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
                }
            }
        }

        //add intentions for new parcels
        for (let [id, parcel] of parcels) {
            if (!parcelsIDs.has(id)) {
                console.log('new parcel at', parcel.position);
                let goal = parcel.position;
                let pickUp = id;
                let deliver = false;
                this.addIntention(new Intention(goal, pickUp, deliver));
            }
        }

    }
}

const carriedParcels = [];
const intentions = new Intentions();

function IntentionRevision(client) {
    client.onMap(async () => {
        //wait 1 second for the map to be updated
        await new Promise(resolve => setTimeout(resolve, 500));
        intentions.generateIntentions();
        setInterval(() => {
            intentions.updateIntentions();
            intentions.selectIntention(client);
        }, 100);
    });
}

export {IntentionRevision};