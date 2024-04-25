import { map, MAX_FUTURE } from '../map/map.js';
import { me, distance } from '../beliefs.js';

const MAX_HISTORY = 5;

//believed intentions

let intentions = {
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
        let clostest_distance = dist;
        for (let i = position.x - dist; i <= position.x + dist; i++) {
            for (let j = position.y - dist;j <= position.y + dist; j++) {
                if (i < 0 || j < 0 || i >= map.width || j >= map.height) continue;
                if (map.map[i][j].parcel) {
                    if (distance(position, map.map[i][j]) < distance(lastPosition, map.map[i][j]) 
                        && distance(position, map.map[i][j]) < clostest_distance) {
                        this.intention = intentions.PICK_UP;
                        if (this.objective != map.map[i][j]){
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
            this.intention = intentions.DELIVER;
            //TODO check
            if (this.objective != map.map[position.x][position.y].closest_delivery){
                this.objective = map.map[position.x][position.y].closest_delivery
                this.goTo(position, this.objective);
            }
            //console.log("intention: deliver")
            return;
        }

        //else keep moving in the same direction
        this.intention = intentions.MOVE;
        this.objective = {x:-1,y:-1};
        this.keepMoving(position);
        //console.log("intention: keep moving")
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
                if (this.futureMoves.length > 0){
                    this.futureMoves.push(
                        this.futureMoves[this.futureMoves.length - 1]
                    );
                }else{
                    this.futureMoves.push({x:pos.x-dx,y:pos.y-dy});
                }
            } else if (map.map[pos.x][pos.y].type === "obstacle") {
                if (this.futureMoves.length > 0){
                    this.futureMoves.push(
                        this.futureMoves[this.futureMoves.length - 1]
                    );
                }else{
                    this.futureMoves.push({x:pos.x-dx,y:pos.y-dy});
                }
            }else {
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
    goTo(pos,obj) {
        this.futureMoves = [];
        //TODO: use a more efficient path planner
        let steps = map.BFS(pos, obj);
        
        for (let i = 0; i < MAX_FUTURE; i++) {
            if (steps.length === 0) {
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

    /**
     * Method to predict the next position of the agent
     * @returns {{x:number,y:number}} The next position of the agent
     */
    nextStep() {
        let next_pos = this.futureMoves[0];
        this.futureMoves.shift();
        this.futureMoves.push(
            this.futureMoves[this.futureMoves.length - 1]
        );
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
 */
class Agent {
    position;
    history;
    carrying;
    believedIntetion;
    inView;

    /**
     * 
     * @param {[{x:number,y:number}]} position - The position history of the agent
     */
    constructor(position) {
        this.position = position;
        this.history = [];
        this.inView = true;
        this.carrying = (map.map[position.x][position.y].parcel ? true : false); //TODO: change implementation to use lookup in parcels
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
            this.position = newPosition;
        }
        
        this.believedIntetion = new BelievedIntention(this.history, this.carrying);
    }

    /**
     * update the agent's predicted position
     */
    updatePredicted() {
        this.inView = false;
        this.position = this.believedIntetion.nextStep();
    }
}

/** @type {Map<string, Agent>} */
const agents = new Map();

/**
 * @param {[ { id:string, name:string, x:number, y:number, score:number } ]} sensedAgents 
 */
function senseAgents(sensedAgents) {
    //console.log("sensing agents")
    let inView = []
    //TODO: Implement this function
    for (const agent of sensedAgents) {
        inView.push(agent.id);
        if(agent.x % 1 !== 0 || agent.y % 1 !== 0) continue;
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
        //console.log(agent);
    }
}


export {
    Agent,
    agents,
    senseAgents
}
