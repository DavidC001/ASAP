import { map, MAX_FUTURE } from '../map/map.js';
import { me, distance } from '../beliefs.js';

const MAX_HISTORY = 5;

//believed intentions
/**
 * @class BelievedIntention
 * 
 * @param STILL
 * @param MOVE
 * @param PICK_UP
 * @param DELIVER
 * 
 * @argument {[{x:number,y:number}]} history - The position history of the agent
 * @argument carrying - The object the agent is carrying
 */
let intentions = {
    STILL: "STILL",
    MOVE: "MOVE",
    PICK_UP: "PICK_UP",
    DELIVER: "DELIVER"
}
class BelievedIntention {
    intention;
    lastMove;
    objective;
    futureMoves;

    constructor(history, carrying) {
        console.log("predicting intention");
        if (history.length < 2) {
            this.intention = intentions.STILL;
            this.futureMoves = new Array(MAX_FUTURE).fill(history[history.length - 1]);
            console.log("intention: still")
            return;
        }

        let position = history[history.length - 1];
        let lastPosition = history[history.length - 2];

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

        if (position.x == lastPosition.x && position.y == lastPosition.y) {
            this.lastMove = "NONE";
        }

        //look around the agent, if a parcel is nearby and it moved closer to it, then the intention is to pick up
        let dist = me.config.AGENTS_OBSERVATION_DISTANCE
        let clostest_distance = dist;
        for (let i = position.x - dist; i <= position.x + dist; i++) {
            for (let j = position.y - dist;j <= position.y + dist; j++) {
                if (i < 0 || j < 0 || i >= map.width || j >= map.height) continue;
                if (map.map[i][j].parcel) {
                    if (distance(position, map.map[i][j]) < distance(lastPosition, map.map[i][j]) 
                        && distance(position, map.map[i][j]) < clostest_distance) {
                        this.intention = intentions.PICK_UP;
                        this.objective = map.map[i][j];
                        this.goTo(position);
                        console.log("intention: pick up")
                        return;
                    }
                }
            }
        }

        if (carrying) {
            this.intention = intentions.DELIVER;
            //TODO
            //this.objective = map.map[position.x][position.y].clostestDelivery
            this.objective = {x:0,y:0};
            this.goTo(position);
            console.log("intention: deliver")
            return;
        }

        //else keep moving in the same direction
        this.intention = intentions.MOVE;
        this.objective = {x:-1,y:-1};
        this.keepMoving(position);
        console.log("intention: keep moving")
    }

    keepMoving(pos) {
        //TODO blocked by obstacles
        this.futureMoves = [];
        for (let i = 0; i < MAX_FUTURE; i++) {
            if (this.lastMove == "UP") {
                this.futureMoves.push(
                    { x: pos.x, y: Math.max(map.height,pos.y + i)}
                );
            } else if (this.lastMove == "DOWN") {
                this.futureMoves.push(
                    { x: pos.x, y: Math.min(0, pos.y - i)}
                );
            } else if (this.lastMove == "LEFT") {
                this.futureMoves.push(
                    { x: Math.min(0,pos.x - i), y: pos.y }
                );
            } else if (this.lastMove == "RIGHT") {
                this.futureMoves.push(
                    { x: Math.max(map.width, pos.x + i), y: pos.y }
                );
            } else {
                this.futureMoves.push(
                    pos
                );
            }

            pos = this.futureMoves[this.futureMoves.length - 1];
        }
        
    }

    goTo(pos) {
        this.futureMoves = [];
        //TODO: BFS to find the shortest path to the objective
        //steps = map.BFS(pos, this.objective);
        let steps = Array(MAX_FUTURE).fill(pos);
        for (let i = 0; i < MAX_FUTURE; i++) {
            if (steps.length == 0) {
                this.futureMoves.push(
                    this.futureMoves[this.futureMoves.length - 1]
                );
            } else {
                this.futureMoves.push(
                    steps.shift()
                );
            }
        }
    }

    nextStep() {
        let next_pos = this.futureMoves[0];
        this.futureMoves.shift();
        this.futureMoves.push(
            this.futureMoves[this.futureMoves.length - 1]
        );
        return next_pos;
    }

}

BelievedIntention.prototype.toString = function() {
    string = "Intention: " + this.intention + "\n";
    string += "Objective: " + this.objective + "\n";
    string += "Future moves: [\n";
    for (let move of this.futureMoves) {
        string += "    {x:" + move.x + ", y:" + move.y + "}\n";
    }
    string += "]";
    return string;
}

/**
 * @class Agent
 * 
 * @param {[{x:number,y:number}]} position - The position history of the agent
 * 
 */
class Agent {
    position;
    history;
    carrying;
    believedIntetion;
    inView;

    /**
     * 
     * @param {{x:number,y:number}} position
     * 
     */
    constructor(position) {
        this.position = position;
        this.history = [];
        this.inView = true;
        this.carrying = (map.map[position.x][position.y].parcel ? true : false);
        this.updateHistory(position);
    }

    /**
     * Update the agent's position
     * 
     * @param {{x:number,y:number}} newPosition
     *  
     */
    updateHistory(newPosition) {
        if (!this.inView)
        {
            this.position = newPosition;
            this.history = [newPosition];
            this.inView = true;
        }
        else
        {
            this.history.push(newPosition);
            if (this.history.length > MAX_HISTORY) {
                this.history.shift();
            }
        }
        
        this.believedIntetion = new BelievedIntention(this.history, this.carrying);
    }

    /**
     * update the agent's informations
     */
    updatePredicted() {
        this.inView = false;
        this.position = this.believedIntetion.nextStep();
    }
}

/** @type {Map<string, Agent>} */
const agents = new Map();

/**
 * @param {[ { id:string, name:string, x:number, y:number, score:number } ]} agents 
 */
function senseAgents(sensedAgents) {
    let inView = []
    //TODO: Implement this function
    for (const agent of sensedAgents) {
        inView.push(agent.id);
        if(agent.x % 1 != 0 || agent.y % 1 != 0) continue;
        if (!agents.has(agent.id)) {
            agents.set(agent.id, new Agent({ x: Math.round(agent.x), y: Math.round(agent.y) }));
        } else {
            agents.get(agent.id).updateHistory({ x: Math.round(agent.x), y: Math.round(agent.y) });
        }
    }

    for (const [id, agent] of agents) {
        if (!inView.includes(id)) {
            agent.updatePredicted();
        }
        console.log(agent);
    }
}


export {
    Agent,
    agents,
    senseAgents
}
