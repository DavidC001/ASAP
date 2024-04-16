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
class BelievedIntention {
    static STILL = 0;
    static MOVE = 1;
    static PICK_UP = 2;
    static DELIVER = 3;

    intention;
    lastMove;
    objective;
    futureMoves;

    constructor(history, carrying) {
        if (history.length < 2) {
            this.intention = this.STILL;
            this.futureMoves = new Array(MAX_FUTURE).fill(history[history.length - 1]);
            return;
        }

        let position = history[history.length - 1];
        let lastPosition = history[history.length - 2];

        if (position.x < lastPosition.x) {
            this.lastMove = "RIGHT";
        } else if (position.x > lastPosition.x) {
            this.lastMove = "LEFT";
        }

        if (position.y < lastPosition.y) {
            this.lastMove = "UP";
        } else if (position.y > lastPosition.y) {
            this.lastMove = "DOWN";
        }

        //look around the agent, if a parcel is nearby and it moved closer to it, then the intention is to pick up
        let dist = me.config.AGENTS_OBSERVATION_DISTANCE
        let clostest_distance = dist;
        for (let i = position.x - dist; i <= position.x + dist; i++) {
            for (let j = position.y - dist;j <= position.y + dist; j++) {
                if (i < 0 || j < 0 || i >= map.width || j >= map.height) continue;
                //TODO
                //if (map.map[i][j].parcel) {
                if(false) {
                    if (distance(position, map.map[i][j]) < distance(lastPosition, map.map[i][j]) 
                        && distance(position, map.map[i][j]) < clostest_distance) {
                        this.intention = this.PICK_UP;
                        this.objective = map.map[i][j];
                        this.goTo(position);
                        return;
                    }
                }
            }
        }

        if (carrying) {
            this.intention = this.DELIVER;
            //TODO
            //this.objective = map.map[position.x][position.y].clostestDelivery
            this.objective = {x:0,y:0};
            this.goTo(position);
            return;
        }

        //else keep moving in the same direction
        this.intention = this.MOVE;
        this.keepMoving(position);
    }

    keepMoving(pos) {
        this.futureMoves = [];
        for (let i = 0; i < MAX_FUTURE; i++) {
            if (this.lastMove == "UP") {
                this.futureMoves.push({ x: pos.x, y: Math.min(0,pos.y - i)});
            } else if (this.lastMove == "DOWN") {
                this.futureMoves.push({ x: pos.x, y: Math.max(map.height, pos.y + i)});
            } else if (this.lastMove == "LEFT") {
                this.futureMoves.push({ x: Math.min(0,pos.x - i), y: pos.y });
            } else if (this.lastMove == "RIGHT") {
                this.futureMoves.push({ x: Math.max(map.width, pos.x + i), y: pos.y });
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
                this.futureMoves.push(this.futureMoves[this.futureMoves.length - 1]);
            } else {
                this.futureMoves.push(steps.shift());
            }
        }
    }

    nextStep() {
        next_pos = this.futureMoves[0];
        this.futureMoves.shift();
        this.futureMoves.push(this.futureMoves[this.futureMoves.length - 1]);
        return next_pos;
    }

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
        if (!agents.has(agent.id)) {
            agents.set(agent.id, new Agent({ x: Math.round(agent.x), y: Math.round(agent.y) }));
        } else {
            agents.get(agent.id).updateHistory({ x: Math.round(agent.x), y: Math.round(agent.y) });
        }
        inView.push(agent.id);
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
