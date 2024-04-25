import { map } from '../beliefs/map/map.js';
import { me } from '../beliefs/beliefs.js';

const carriedParcels = [];

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
        plan = map.BFS(this.goal, this.pickUp);
    }

    async executeInt() { //generate plan
        for (let i = 0; i < this.plan.length; i++) {
            await this.plan[i].execute(); //TODO: handle plan failure
            if (this.stop) {
                break;
            }
        }
    }

    utility() {
        let utility = 0;
        if (this.pickUp) {
            if (map.map[this.goal.x][this.goal.y].parcel === null) {
                utility = -1;
            } else {
                let numParcels = carriedParcels.length + 1;
                let score = map.map[this.goal.x][this.goal.y].parcel.score + carriedParcels.reduce((acc, parcel) => acc + parcel.score, 0);
                let steps = len(BFS(me, this.goal)); //TODO: if too slow use manhattan distance
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

    selectIntention() {
        //find the intention with the highest utility
        let maxUtility = -Infinity;
        let maxIntention = null;
        for (let intention of this.intentions) {
            let utility = intention.utility();
            if (utility > maxUtility) {
                maxUtility = utility;
                maxIntention = intention;
            }
        }

        if (this.currentIntention === null) {
            this.currentIntention = intentions[maxIntention]
            this.currentIntention.executeInt();
        } else if (this.currentIntention.goal !== maxIntention.goal) {
            this.currentIntention.stopInt();
            this.currentIntention = intentions[maxIntention];
            this.currentIntention.executeInt();
        }
    }

    generateIntentions() {
        //TODO: generate all the possible intentions (go pick up parcel, deliver parcel, etc.)
    }

    updateIntentions() {
        //TODO: remove intentions that are no longer possible and add new intentions
    }
}


function IntentionRevision() {
    
}