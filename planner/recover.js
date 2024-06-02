import {map} from "../beliefs/map.js";
import {me} from "../beliefs/beliefs.js";

import {otherAgent, AgentRole, sendRequest, awaitRequest} from "../coordination/coordination.js";

/**
 * Tries to recover the plan by going around the agent if possible or negotiating the swap of packages to avoid re-planning
 * @param {number} index The index of the failed move in the plan
 * @param {[{x: number, y: number, move: string}]} plan The plan to recover
 * @param {string} intention_type My current intention
 * @returns {[{x: number, y: number, move: string}]} The new plan, [] if the plan is not recoverable
 */
async function recoverPlan(index, plan, intention_type) {
    let x = plan[index].x;
    let y = plan[index].y;
    console.log("[RECOVER PLAN]");
    if (!map.map[x][y].agent) {
        console.log("\tAgent is gone");
        // if by waiting the agent is gone then try to keep going with the original plan
        plan = plan.slice(index, plan.length);
    } else if (map.map[x][y].agent !== otherAgent.id) {
        console.log("\tAgent is not the other agent");
        // try to go around the agent if possible
        plan = goAround(index, plan);
    } else {
        // TODO: We know it's our friend agent we need to negotiate the swap of packages or who stays still
        console.log('\tAgent is the other agent');
        plan = handleNegotiation(index, plan, intention_type);
    }
    return plan;
}


/**
 * Tries to go around the agent if possible without going too far and without recalculating the whole path
 * @param {number} index The index of the failed move in the plan
 * @param {[{x: number, y: number, move: string}]} plan The plan to recover
 * @returns {[{x: number, y: number, move: string}]} The new plan, [] if the plan is not recoverable
 */
async function goAround(index, plan) {
    //let currMovX = plan[index].x, currMovY = plan[index].y;
    let currMovX = me.x, currMovY = me.y;
    let newPlan = [];
    if (plan[index + 1]) {
        let objective = [{x: plan[index + 1].x, y: plan[index + 1].y}];
        newPlan = await map.BFS({x: currMovX, y: currMovY, move: 'none'}, objective);
        if (newPlan.length > 6 || newPlan.length < 2) {
            newPlan = []
        } else {
            newPlan = newPlan.concat(plan.slice(index + 2));
        }
    }
    return newPlan;
}

/**
 * Handles the negotiation with the other agent to swap packages or who stays still
 * @param {number} index The index of the failed move in the plan
 * @param {[{x: number, y: number, move: string}]} plan The plan to recover
 *
 * @returns {[{x: number, y: number, move: string}]} The new plan, [] if the plan is not recoverable
 */
async function handleNegotiation(index, plan) {
    console.log("\t[NEGOTIATION]");
    if (AgentRole === 1) plan = agent1Negotiation(index, plan);
    else plan = agent0Negotiation(index, plan);

    return plan;
}

/**
 * Negotiates the move aside or the go around with the other agent
 * @param {number} index The index of the failed move in the plan
 * @param {[{x: number, y: number, move: string}]} plan The plan to recover
 *
 * @returns {[{x: number, y: number, move: string}]} The new plan, [] if the plan is not recoverable
 */
async function agent0Negotiation(index, plan) {
    let x = me.x, y = me.y;

    //first only try to negotiate the move aside
    let response = await sendRequest("moveOut");
    console.log(response);
    if (response === "RE-SYNC") {
        plan = [];
    } else if (response === "SUCCESS") {
        plan = [{x: x, y: y, move: "wait"}].concat(plan.slice(index));
        console.log("\t\tMove aside successful");
    } else {
        // negotiate the go around
        response = await sendRequest("planAround");
        console.log(response);
        if (response === "RE-SYNC") {
            plan = [];
        } else if (response !== "FAILED") {
            plan = new Array(6).fill({x: x, y: y, move: "wait"}).concat(plan.slice(index));
            console.log("\t\tPlan around successful");
            if (response === "RE-SYNC") {
                plan = [];
            }
        } else {
            // TODO: negotiate the swap of packages
            let newPlan = [];
            let myPlan = map.BFS({x: x, y: y, move: "none"}, map.deliveryZones);
            let otherPlan = map.BFS({x: plan[index].x, y: plan[index].y, move: "none"}, map.deliveryZones);
            console.log(myPlan.length, otherPlan.length);
            if ((myPlan.length > otherPlan.length) && myPlan.length > 1) {
                newPlan.push({x: x, y: y, move: "deliver"});
                let backtrack = await MoveAside(index, plan, true);
                plan = newPlan.concat(backtrack.slice(0, 2));
                console.log("\t\t Il piano è più corto ");
            } else {
                response = await sendRequest("swap");
                if (response === "SUCCESS") {
                    console.log("\t Swap in corso");
                } else {
                    plan = [];
                    console.log("\t\tHARD REPLAN");
                }
            }
        }
    }
    return plan;
}

/**
 * Negotiates the move aside or the go around with the other agent
 * @param {number} index The index of the failed move in the plan
 * @param {[{x: number, y: number, move: string}]} plan The plan to recover
 * @param {string} intention_type My current intention
 *
 * @returns {[{x: number, y: number, move: string}]} The new plan, [] if the plan is not recoverable
 */
async function agent1Negotiation(index, plan) {
    let planners = {
        "moveOut": MoveAside,
        "planAround": goAround,
        "swap": swap
    }
    let newPlan = [];
    //first only try to move aside
    let incomingRequest = await awaitRequest();
    // console.log("\t Incoming request", incomingRequest);
    if (incomingRequest.content === "FAILED") {
        //if the request timed-out then the plan is not recoverable
        plan = [];
        console.log("\t\tMove aside failed");
    } else {
        //try to comply with the request
        newPlan = await planners[incomingRequest.content](index, plan);
        if (newPlan.length > 0) {
            incomingRequest.reply("SUCCESS");
            plan = newPlan;
            console.log("\t\tMove successful");
        } else {
            incomingRequest.reply("FAILED");
            return agent1Negotiation(index, plan);
        }
    }
    return plan;
}

async function MoveAside(index, plan, no_check = false) {
    let newPlan = [];
    let currX = me.x, currY = me.y;
    let currMove = plan[index].move;
    /*let orthogonalMoves = {
        "up": [[1, 0, "right", "left"], [-1, 0, "left", "right"]],
        "down": [[1, 0, "right", "left"], [-1, 0, "left", "right"]],
        "left": [[0, 1, "up", "down"], [0, -1, "down", "up"]],
        "right": [[0, 1, "up", "down"], [0, -1, "down", "up"]]
    }*/
    let directions = [
        [0, 1, 'up', "down"], [0, -1, 'down', "up"], [1, 0, 'right', "left"], [-1, 0, 'left', "right"]
    ].filter((el) => el[2] !== currMove);
    for (let dir of directions) {
        let newX = currX + dir[0];
        let newY = currY + dir[1];
        //console.log(newX, newY, map.map[newX][newY].agent, map.map[newX][newY].type);
        if (
            newX >= 0 && newX < map.width && newY >= 0 && newY < map.height
            && !map.map[newX][newY].agent
            && map.map[newX][newY].type !== "obstacle"
            && (no_check || !otherAgent.plan.some((p) => p.x === newX && p.y === newY))
        ) {
            newPlan = [{x: newX, y: newY, move: dir[2]}, {x: newX, y: newY, move: "wait"}, {
                x: currX,
                y: currY,
                move: dir[3]
            }].concat(plan.slice(index));
            break;
        }
    }
    return newPlan;
}

async function swap(index, plan) {
    let x = me.x, y = me.y;
    let newPlan = [{x: x, y: y, move: "deliver"}];
    let backtrack = await MoveAside(index, plan, true);
    newPlan = newPlan.concat(backtrack.slice(0, 2))
    return newPlan;
}

export {recoverPlan};