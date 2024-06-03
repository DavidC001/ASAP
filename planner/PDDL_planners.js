import {map, MAX_FUTURE} from "../beliefs/map.js";

import {agentsBeliefSet, futureAgentsBeliefSet} from "../beliefs/agents.js";
import {parcelsBeliefSet} from "../beliefs/parcels.js";
import {otherAgent} from "../coordination/coordination.js";

import fs from "fs";

import {onlineSolver, PddlExecutor, PddlProblem, Beliefset, PddlDomain, PddlAction} from "./pddl-client/index.js";

const MAX_WAIT = 1;
const PDDL_solver = onlineSolver;

/**
 * Use PDDL to find the path to the objective with predictions
 *
 * @param {{x: number, y: number}} pos position to start from
 * @param {[{x: number, y: number}]} objective objectives to reach
 *
 * @returns {[{x: number, y: number, move: string}] path to the objective
 */
async function PDDL_futureBFS(pos, objective) {
    let position_belief = new Beliefset();
    position_belief.declare('at t_' + pos.x + '_' + pos.y);
    position_belief.declare('visited t_' + pos.x + '_' + pos.y);
    let time_belief = new Beliefset();
    time_belief.declare('time T1');
    for (let i = 2; i <= MAX_FUTURE; i++) {
        time_belief.undeclare('time T' + i);
    }
    let objective_str = "or ";

    for (let goal of objective) {
        objective_str += '(at t_' + goal.x + '_' + goal.y + ') ';
    }

    var pddlProblem = new PddlProblem(
        'bfs-example-problem',
        map.beliefSet.objects.join(' ') + ' ' + time_belief.objects.join(' ') + ' T0',
        map.beliefSet.toPddlString() + ' ' + position_belief.toPddlString() + ' '
        + futureAgentsBeliefSet.toPddlString() + ' ' + time_belief.toPddlString() + ' '
        + otherAgent.planBeliefset.toPddlString(),
        objective_str
    );

    let plan = [{x: pos.x, y: pos.y, move: "none"}];

    let moves = []

    for (let i = 1; i <= MAX_FUTURE; i++) {
        moves.push(new PddlAction(
            'move' + i,
            '?from ?to',
            'and (not (collaborator ?to)) (time T' + i + ') (at ?from) (connected ?from ?to) (not (visited ?to)) (not (agent ?to T' + i + '))' + (i > 1 ? '' : ' (not (agent ?to T0))'),
            'and (not (at ?from)) (at ?to) (visited ?to)' + (i < MAX_FUTURE ? ' (not (time T' + i + ')) (time T' + (i + 1) + ')' : ''),
            async (f, t) => {
                //get x and y from the string
                let from = f.split('_');
                let from_x = parseInt(from[1]);
                let from_y = parseInt(from[2]);
                let to = t.split('_');
                let to_x = parseInt(to[1]);
                let to_y = parseInt(to[2]);

                let move = "none";

                if (from_x < to_x) move = "right";
                if (from_x > to_x) move = "left";
                if (from_y < to_y) move = "up";
                if (from_y > to_y) move = "down";

                plan.push({x: to_x, y: to_y, move: move});
            }
        ));
    }

    for (let i = 0; i < MAX_WAIT; i++) {
        for (let j = 1; j <= MAX_FUTURE; j++) {
            moves.push(new PddlAction(
                'wait' + i + 'T' + j,
                '?tile',
                'and (time T' + j + ') (at ?tile) (not (waited' + i + ' ?tile))',
                'and (waited' + i + ' ?tile)' + (j < MAX_FUTURE ? ' (not (time T' + j + ')) (time T' + (j + 1) + ')' : ''),
                async (f) => {
                    //get x and y from the string
                    let from = f.split('-');
                    let from_x = parseInt(from[1]);
                    let from_y = parseInt(from[2]);

                    plan.push({x: from_x, y: from_y, move: "wait"});
                }
            ));
        }
    }

    let pddlDomain = new PddlDomain('CleanBFS', ...moves);

    let problem = pddlProblem.toPddlString();
    let domain = pddlDomain.toPddlString();
    // console.log("Domain", domain);
    //write domain to file
    fs.writeFileSync("domain.pddl", domain);
    // console.log("Problem", problem);
    //write problem to file
    fs.writeFileSync("problem.pddl", problem);

    let pddl = await PDDL_solver(domain, problem)

    const pddlExecutor = new PddlExecutor(...moves);
    await pddlExecutor.exec(pddl, true);

    return plan;
}

/**
 * Use PDDL to find the path to the objective with frozen agents
 *
 * @param {{x: number, y: number}} pos position to start from
 * @param {[{x: number, y: number}]} objective objectives to reach
 *
 * @returns {[{x: number, y: number, move: string}] path to the objective
 */
async function PDDL_frozenBFS(pos, objective) {
    let position_belief = new Beliefset();
    position_belief.declare('at t_' + pos.x + '_' + pos.y);
    position_belief.declare('visited t_' + pos.x + '_' + pos.y);
    let objective_str = "or ";

    for (let goal of objective) {
        objective_str += '(at t_' + goal.x + '_' + goal.y + ') ';
    }

    var pddlProblem = new PddlProblem(
        'bfs-example-problem',
        map.beliefSet.objects.join(' '),
        map.beliefSet.toPddlString() + ' ' + position_belief.toPddlString() + ' ' + agentsBeliefSet.toPddlString(),
        objective_str
    );

    let plan = [{x: pos.x, y: pos.y, move: "none"}];

    let move = new PddlAction(
        'move',
        '?from ?to',
        'and (at ?from) (connected ?from ?to) (not (visited ?to)) (not (agent ?to)) (not (collaborator ?to))',
        'and (not (at ?from)) (at ?to) (visited ?to)',
        async (f, t) => {
            //get x and y from the string
            let from = f.split('_');
            let from_x = parseInt(from[1]);
            let from_y = parseInt(from[2]);
            let to = t.split('_');
            let to_x = parseInt(to[1]);
            let to_y = parseInt(to[2]);

            let move = "none";

            if (from_x < to_x) move = "right";
            if (from_x > to_x) move = "left";
            if (from_y < to_y) move = "up";
            if (from_y > to_y) move = "down";

            plan.push({x: to_x, y: to_y, move: move});
        }
    );

    let pddlDomain = new PddlDomain('CleanBFS', move);

    let problem = pddlProblem.toPddlString();
    // fs.writeFileSync("problem.pddl", problem);
    let domain = pddlDomain.toPddlString();
    // fs.writeFileSync("domain.pddl", domain);

    let pddl = await PDDL_solver(domain, problem)

    const pddlExecutor = new PddlExecutor(move);
    await pddlExecutor.exec(pddl, true);

    return plan;
}

/**
 * Use PDDL to find the path to the objective ignoring other agents
 *
 * @param {{x: number, y: number}} pos position to start from
 * @param {*} objective objectives to reach
 * @param {boolean} lookUp if the plan should be saved in the lookUp
 *
 * @returns {[{x: number, y: number, move: string}]} path to the objective
 */
async function PDDL_cleanBFS(pos, objective, lookUp = true) {
    let key = {"pos": {x: pos.x, y: pos.y}, "objective": objective};
    key = JSON.stringify(key);

    // check if the plan is already in the lookUp
    if (map.planLookUp.has(key) && lookUp) {
        let lookUpPlan = map.planLookUp.get(key);
        // console.log("\t[PDDL] plan found in lookUp for", key);
        // console.log("\t[PDDL] plaan", lookUpPlan);
        return JSON.parse(JSON.stringify(lookUpPlan));
    }

    // otherwise calculate the plan
    let position_belief = new Beliefset();
    position_belief.declare('at t_' + pos.x + '_' + pos.y);
    position_belief.declare('visited t_' + pos.x + '_' + pos.y);
    let objective_str = "or ";

    for (let goal of objective) {
        objective_str += '(at t_' + goal.x + '_' + goal.y + ') ';
    }

    var pddlProblem = new PddlProblem(
        'bfs-example-problem',
        map.beliefSet.objects.join(' '),
        map.beliefSet.toPddlString() + ' ' + position_belief.toPddlString(),
        objective_str
    );

    let plan = [{x: pos.x, y: pos.y, move: "none"}];

    let move = new PddlAction(
        'move',
        '?from ?to',
        'and (at ?from) (connected ?from ?to) (not (visited ?to))',
        'and (not (at ?from)) (at ?to) (visited ?to)',
        async (f, t) => {
            //get x and y from the string
            let from = f.split('_');
            let from_x = parseInt(from[1]);
            let from_y = parseInt(from[2]);
            let to = t.split('_');
            let to_x = parseInt(to[1]);
            let to_y = parseInt(to[2]);

            let move = "none";

            if (from_x < to_x) move = "right";
            if (from_x > to_x) move = "left";
            if (from_y < to_y) move = "up";
            if (from_y > to_y) move = "down";

            plan.push({x: to_x, y: to_y, move: move});
        }
    );

    let pddlDomain = new PddlDomain('CleanBFS', move);

    let problem = pddlProblem.toPddlString();
    let domain = pddlDomain.toPddlString();

    let pddl = await PDDL_solver(domain, problem)

    const pddlExecutor = new PddlExecutor(move);
    await pddlExecutor.exec(pddl, true);

    // save the plan in the lookUp
    // console.log("\t[PDDL] adding plan", plan);
    if (lookUp) map.planLookUp.set(key, JSON.parse(JSON.stringify(plan)));
    // console.log("\t[PDDL] adding plan to lookUp", key, map.planLookUp.get(key));

    return plan;
}

async function PDDL_pickupAndDeliver(pos, objective) {
    let position_belief = new Beliefset();
    position_belief.declare('at t_' + pos.x + '_' + pos.y);
    position_belief.declare('visited t_' + pos.x + '_' + pos.y);
    let objective_str = "and (picked) (delivered)";
    let deliveryZones = "or";
    let pickupZone = 't_' + objective[0].x + '_' + objective[0].y;

    for (let delivery of map.deliveryZones) {
        deliveryZones += ' (at t_' + delivery.x + '_' + delivery.y + ')';
    }

    var pddlProblem = new PddlProblem(
        'bfs-example-problem',
        map.beliefSet.objects.join(' '),
        map.beliefSet.toPddlString() + ' ' + position_belief.toPddlString() + ' ' + agentsBeliefSet.toPddlString(),
        objective_str
    );

    let plan = [{x: pos.x, y: pos.y, move: "none"}];

    let moveb = new PddlAction(
        'moveb',
        '?from ?to',
        'and (not (picked)) (at ?from) (connected ?from ?to) (not (visited ?to)) (not (agent ?to)) (not (collaborator ?to))',
        'and (not (at ?from)) (at ?to) (visited ?to)',
        async (f, t) => {
            //get x and y from the string
            let from = f.split('_');
            let from_x = parseInt(from[1]);
            let from_y = parseInt(from[2]);
            let to = t.split('_');
            let to_x = parseInt(to[1]);
            let to_y = parseInt(to[2]);

            let move = "none";

            if (from_x < to_x) move = "right";
            if (from_x > to_x) move = "left";
            if (from_y < to_y) move = "up";
            if (from_y > to_y) move = "down";

            plan.push({x: to_x, y: to_y, move: move});
        }
    );
    let movea = new PddlAction(
        'movea',
        '?from ?to',
        'and (picked) (at ?from) (connected ?from ?to) (not (visiteda ?to)) (not (agent ?to)) (not (collaborator ?to))',
        'and (not (at ?from)) (at ?to) (visiteda ?to)',
        async (f, t) => {
            //get x and y from the string
            let from = f.split('_');
            let from_x = parseInt(from[1]);
            let from_y = parseInt(from[2]);
            let to = t.split('_');
            let to_x = parseInt(to[1]);
            let to_y = parseInt(to[2]);

            let move = "none";

            if (from_x < to_x) move = "right";
            if (from_x > to_x) move = "left";
            if (from_y < to_y) move = "up";
            if (from_y > to_y) move = "down";

            plan.push({x: to_x, y: to_y, move: move});
        }
    );

    let pickup = new PddlAction(
        'pickup',
        '',
        'and (not (picked)) (at ' + pickupZone + ')',
        'and (picked) (visiteda ' + pickupZone + ')',
        async (f) => {
            //get x and y from the string
            let from = f.split('_');
            let from_x = parseInt(from[1]);
            let from_y = parseInt(from[2]);

            plan.push({x: from_x, y: from_y, move: "pickup"});
        }
    );

    let deliver = new PddlAction(
        'deliver',
        '',
        'and (picked) (not (delivered)) (' + deliveryZones + ')',
        'and (delivered)',
        async (f) => {
            //get x and y from the string
            let from = f.split('_');
            let from_x = parseInt(from[1]);
            let from_y = parseInt(from[2]);

            plan.push({x: from_x, y: from_y, move: "deliver"});
        }
    );

    let pddlDomain = new PddlDomain('pickupAndDeliver', movea, moveb, pickup, deliver);

    let problem = pddlProblem.toPddlString();
    fs.writeFileSync("problem.pddl", problem);
    let domain = pddlDomain.toPddlString();
    fs.writeFileSync("domain.pddl", domain);

    let pddl = await PDDL_solver(domain, problem)

    const pddlExecutor = new PddlExecutor(movea, moveb, pickup, deliver);
    await pddlExecutor.exec(pddl, true);

    return plan;
}

/**
 * Use PDDL to find the path to the objective
 *
 * @param {{x: number, y: number}} pos position to start from
 * @param {[{x: number, y: number}]} objective objectives to reach
 * @param {boolean} fallback if the search should fallback to simple BFS if no path is found
 * @returns {[{x: number, y: number, move: string}]} path to the objective
 */
async function PDDL_path(pos, objective, fallback = true) {
    // console.log("\t[PDDL] future BFS");
    // let path = await PDDL_futureBFS(pos, objective);
    let path = await PDDL_frozenBFS(pos, objective); //TODO: fix other agent in goal makes it "goal can be simplified to false"
    if (path.length === 1 && fallback && !objective.some(o => pos.x === o.x && pos.y === o.y)) {
        console.log("\t[PDDL] No path found, using clean BFS");
        path = await PDDL_cleanBFS(pos, objective);
    }

    // console.log("\t[PDDL] path", path)

    return path;
}

export {PDDL_path, PDDL_cleanBFS, PDDL_frozenBFS, PDDL_futureBFS, PDDL_pickupAndDeliver};