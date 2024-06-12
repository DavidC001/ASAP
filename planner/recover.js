import {map} from "../beliefs/map.js";
import {me} from "../beliefs/beliefs.js";

import {otherAgent, AgentRole, sendRequest, awaitRequest} from "../coordination/coordination.js";
import {frozenBFS} from "./search_planners.js";

import {BASE_FAIL_WAIT, MAX_WAIT_FAIL} from "../config.js";

/**
 * An object that contains the different planners to recover the plan for the agent 1 negotiation
 * */
let planners = {
    "moveOut": async (index, plan) => {
        plan = await MoveAside(index, plan, false);
        if (plan.length > 0) {
            return [plan[0], {x: 0, y: 0, move: "answer"}].concat(plan.slice(1));
        }
        return [];
    },
    "swap": async (index, plan) => {
        let backtrack = await MoveAside(index, plan, true);
        if (backtrack.length > 0) {
            return [{x: me.x, y: me.y, move: "deliver"}, backtrack[0], {
                x: backtrack[0].x,
                y: backtrack[0].y,
                move: "answer"
            }, backtrack[1]];
        }
        return [];
    },
    "goForward": async (index, plan) => {
        return [{x: me.x, y: me.y, move: "await"}, plan[index], {
            x: me.x,
            y: me.y,
            move: "answer"
        }].concat(plan.slice(index + 1));
    },
    "pickUp": async (index, plan) => {
        return [{x: me.x, y: me.y, move: "await"}, plan[index], {
            x: plan[index].x,
            y: plan[index].y,
            move: "pickup"
        }, {x: plan[index].x, y: plan[index].y, move: "answer"}];
    },
    "moveOut & pickUp": async (index, plan) => {
        let backtrack = await MoveAside(index, plan, true);
        if (backtrack.length > 0) {
            return [backtrack[0], {x: 0, y: 0, move: "answer"}, backtrack[1], backtrack[2], {
                x: me.x,
                y: me.y,
                move: "pickup"
            }, {x: 0, y: 0, move: "answer"}];
        }
        return [];
    },
    "waitForOther": async (index, plan) => {
        return [{x: me.x, y: me.y, move: "await"}].concat(plan.slice(index, index + 2)).concat([{
            x: 0,
            y: 0,
            move: "answer"
        }]).concat(plan.slice(index + 2));
    }
}


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
    if (map.map[x][y].agent !== otherAgent.id) {
        // Wait some moves before replanning
        await new Promise((resolve) => setTimeout(resolve, BASE_FAIL_WAIT + me.config.MOVEMENT_DURATION * (Math.round(Math.random() * MAX_WAIT_FAIL))));
        if (map.map[x][y].agent === null) {
            console.log("\tAgent is gone");
            // if by waiting the agent is gone then try to keep going with the original plan
            plan = plan.slice(index, plan.length);
        } else {
            console.log("\tAgent is not the other agent");
            // try to go around the agent if possible
            plan = goAround(index, plan);
        }
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
        if (plan[index+1].move === "deliver") {
            objective = map.deliveryZones;
        }
        newPlan = await frozenBFS({x: currMovX, y: currMovY, move: 'none'}, objective);
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
    console.log("\t[NEGOTIATION] AgentRole: ", AgentRole);
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
    let newPlan = [];
    // If the other agent is delivering and I'm not, I try to swap packages
    if (otherAgent.intention.type === "deliver" || me.intention.type === 'deliver') {
        newPlan = await swapPackages(plan, index);
        if (newPlan) return newPlan;
    }
    // First only try to negotiate the move aside
    let response = await sendRequest("moveOut");
    console.log(response);
    if (response === "RE-SYNC") {
        return [];
    }
    
    if (response === "SUCCESS") {
        plan = [{x: x, y: y, move: "await"}].concat(plan.slice(index, index + 2)).concat([{
            x: x,
            y: y,
            move: "answer"
        }]).concat(plan.slice(index + 2));
        console.log("\t\tMove aside successful");
        return plan;
    }
    // If the other agent cannot move aside, we try to move aside
    newPlan = await planners['moveOut'](index, plan);
    if (newPlan.length > 0) {
        response = await sendRequest("waitForOther");
        if (response === "SUCCESS") {
            console.log("\tI'm moving aside and waiting for the other agent to pass");
            return newPlan;
        }
    }

    return [];
}

/**
 * Negotiates the move aside or the go around with the other agent
 * @param {number} index The index of the failed move in the plan
 * @param {[{x: number, y: number, move: string}]} plan The plan to recover
 *
 * @returns {[{x: number, y: number, move: string}]} The new plan, [] if the plan is not recoverable
 */
async function agent1Negotiation(index, plan) {
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

/**
 * Moves aside the agent to let the other agent pass
 * @param index At which step of the plan we are
 * @param plan The plan to recover
 * @param no_check Whether to check if the other agent plan is colliding with our plan
 * @returns {Promise<*[]>} The new plan created if possible, otherwise an empty plan
 */
async function MoveAside(index, plan, no_check = false) {
    let newPlan = [];
    let currX = me.x, currY = me.y;
    let currMove = plan[index].move;
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
            newPlan = [{x: newX, y: newY, move: dir[2]}, {x: newX, y: newY, move: "await"}, {
                x: currX,
                y: currY,
                move: dir[3]
            }].concat(plan.slice(index));
            break;
        }
    }
    return newPlan;
}

/**
 * Tries to swap packages with the other agent to avoid hard re-planning
 * @param plan The plan to recover
 * @param index The index of the current plan
 * @returns {Promise<*[]>}
 */
async function swapPackages(plan, index) {
    let x = me.x, y = me.y;
    let inverseMove = {
        "up": "down",
        "down": "up",
        "left": "right",
        "right": "left"
    }
    let myPlan = frozenBFS(me, map.deliveryZones).length - 1;
    let otherPlan = frozenBFS(otherAgent.position, map.deliveryZones).length - 1;
    let response;
    if ((myPlan < 1 && !map.deliveryZones.some((el) => el.x === x && el.y === y)) || (otherPlan < myPlan)) {
        console.log("\t\t L'altro agent ha un piano più corto ");
        let backtrack = await MoveAside(index, plan, true);
        if (backtrack.length > 0) {
            console.log("\t\t Delivering and moving aside");
            plan = [{x: x, y: y, move: "deliver"}, backtrack[0], {x: 0, y: 0, move: "answer"}, backtrack[1],];
            response = await sendRequest("pickUp");
        } else {
            //send request to other agent to back off
            response = await sendRequest("moveOut & pickUp");
            if (response === "SUCCESS") {
                console.log("\t\t Moving up and delivering");
                plan = [{x: x, y: y, move: "await"}, plan[index], {
                    x: plan[index].x,
                    y: plan[index].y,
                    move: "deliver"
                }, {x: x, y: y, move: inverseMove[plan[index].move]}, {x: x, y: y, move: "answer"}, {
                    x: x,
                    y: y,
                    move: "await"
                }];
            } else {
                plan = [];
                console.log("\t\tHARD REPLAN");
            }
        }
    } else {
        console.log("\t\t L'altro agent ha un piano più lungo o uguale");
        response = await sendRequest("swap");
        if (response === "SUCCESS") {
            console.log("\t\tSwap successful");
            // keep the same plan
            plan = [{x: x, y: y, move: "await"}, plan[index], {x: x, y: y, move: "pickup"}, {
                x: x,
                y: y,
                move: "answer"
            }];
        } else {
            console.log("\t\tSwap failed, trying to move aside");
            // if he can't, I am probably blocking him, so I drop the package, move aside and wait
            let backtrack = await MoveAside(index, plan, true);
            if (backtrack.length > 0) {
                console.log("\t\t Leaving clear path for the other agent to swap");
                response = await sendRequest("goForward");
                let newX = backtrack[0].x, newY = backtrack[0].y;
                plan = [backtrack[0], {x: newX, y: newY, move: "answer"}, backtrack[1], backtrack[2], {
                    x: x,
                    y: y,
                    move: "fail"
                }];
            } else {
                // do not know what to do, hard replan
                plan = [];
                console.log("\t\tHARD REPLAN");
            }
        }
    }
    return plan;
}

export {recoverPlan};