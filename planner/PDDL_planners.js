import {map, MAX_FUTURE} from "../beliefs/map/map.js";
import {me} from "../beliefs/beliefs.js";

import {agentsBeliefSet, futureAgentsBeliefSet} from "../beliefs/agents/agents.js";
import { parcelsBeliefSet } from "../beliefs/parcels/parcels.js";

import fs from "fs";

import { onlineSolver, PddlExecutor, PddlProblem, Beliefset, PddlDomain, PddlAction } from "./pddl-client/index.js";

const MAX_WAIT = 10;
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
    position_belief.declare('at t-'+pos.x+'-'+pos.y);
    position_belief.declare('visited t-'+pos.x+'-'+pos.y);
    let time_belief = new Beliefset();
    time_belief.declare('time T1');
    for (let i = 2; i <= MAX_FUTURE; i++) {
        time_belief.undeclare('time T'+i);
    }
    let objective_str = "or ";

    for (let goal of objective) {
        objective_str += '(at t-'+goal.x+'-'+goal.y+') ';
    }

    var pddlProblem = new PddlProblem(
        'bfs-example-problem',
        map.beliefSet.objects.join(' ') + ' ' + time_belief.objects.join(' ') + ' T0',
        map.beliefSet.toPddlString() + ' ' + position_belief.toPddlString() + ' ' + futureAgentsBeliefSet.toPddlString() + ' ' + time_belief.toPddlString(),
        objective_str
    );

    let plan = [{x: pos.x, y: pos.y, move: "none"}];

    let moves = []

    for (let i = 1; i <= MAX_FUTURE; i++) {
        moves.push(new PddlAction(
            'move'+i,
            '?from ?to',
            'and (time T'+i+') (at ?from) (connected ?from ?to) (not (visited ?to)) (not (agent ?to T'+i+'))'+ (i > 1 ? '' : ' (not (agent ?to T0))'),
            'and (not (at ?from)) (at ?to) (visited ?to)'+(i<MAX_FUTURE? ' (not (time T'+i+')) (time T'+(i+1)+')' : ''),
            async ( f, t ) => {
                //get x and y from the string
                let from = f.split('-');
                let from_x = parseInt(from[1]);
                let from_y = parseInt(from[2]);
                let to = t.split('-');
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
                'wait'+i+'-'+j,
                '?tile',
                'and (time T'+j+') (at ?tile) (not (waited'+i+' ?tile))',
                'and (waited'+i+' ?tile)'+(j<MAX_FUTURE? ' (not (time T'+j+')) (time T'+(j+1)+')' : ''),
                async ( f ) => {
                    //get x and y from the string
                    let from = f.split('-');
                    let from_x = parseInt(from[1]);
                    let from_y = parseInt(from[2]);
                    
                    plan.push({x: from_x, y: from_y, move: "none"});
                }
            ));
        }
    }

    let pddlDomain = new PddlDomain( 'CleanBFS', ...moves );

    let problem = pddlProblem.toPddlString();
    let domain = pddlDomain.toPddlString();
    // console.log("Domain", domain);
    //write domain to file
    fs.writeFileSync("domain.pddl", domain);
    // console.log("Problem", problem);
    //write problem to file
    fs.writeFileSync("problem.pddl", problem);

    let pddl = await PDDL_solver( domain, problem )

    const pddlExecutor = new PddlExecutor( ...moves );
    await pddlExecutor.exec( pddl , true);

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
    position_belief.declare('at t-'+pos.x+'-'+pos.y);
    position_belief.declare('visited t-'+pos.x+'-'+pos.y);
    let objective_str = "or ";

    for (let goal of objective) {
        objective_str += '(at t-'+goal.x+'-'+goal.y+') ';
    }

    var pddlProblem = new PddlProblem(
        'bfs-example-problem',
        map.beliefSet.objects.join(' ') + ' ' + agentsBeliefSet.objects.join(' '),
        map.beliefSet.toPddlString() + ' ' + position_belief.toPddlString() + ' ' + agentsBeliefSet.toPddlString(),
        objective_str
    );

    let plan = [{x: pos.x, y: pos.y, move: "none"}];

    let move = new PddlAction(
        'move',
        '?from ?to',
        'and (at ?from) (connected ?from ?to) (not (visited ?to)) (not (agent ?to))',
        'and (not (at ?from)) (at ?to) (visited ?to)',
        async ( f, t ) => {
            //get x and y from the string
            let from = f.split('-');
            let from_x = parseInt(from[1]);
            let from_y = parseInt(from[2]);
            let to = t.split('-');
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

    let pddlDomain = new PddlDomain( 'CleanBFS', move );

    let problem = pddlProblem.toPddlString();
    fs.writeFileSync("problem.pddl", problem);
    let domain = pddlDomain.toPddlString();
    fs.writeFileSync("domain.pddl", domain);

    let pddl = await PDDL_solver( domain, problem )

    const pddlExecutor = new PddlExecutor( move );
    await pddlExecutor.exec( pddl , true);

    return plan;
}

/**
 * Use PDDL to find the path to the objective ignoring other agents
 * 
 * @param {{x: number, y: number}} pos position to start from 
 * @param {*} objective objectives to reach
 * 
 * @returns {[{x: number, y: number, move: string}]} path to the objective
 */
async function PDDL_cleanBFS(pos, objective) {
    let position_belief = new Beliefset();
    position_belief.declare('at t-'+pos.x+'-'+pos.y);
    position_belief.declare('visited t-'+pos.x+'-'+pos.y);
    let objective_str = "or ";

    for (let goal of objective) {
        objective_str += '(at t-'+goal.x+'-'+goal.y+') ';
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
        async ( f, t ) => {
            //get x and y from the string
            let from = f.split('-');
            let from_x = parseInt(from[1]);
            let from_y = parseInt(from[2]);
            let to = t.split('-');
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

    let pddlDomain = new PddlDomain( 'CleanBFS', move );

    let problem = pddlProblem.toPddlString();
    let domain = pddlDomain.toPddlString();

    let pddl = await PDDL_solver( domain, problem )

    const pddlExecutor = new PddlExecutor( move );
    await pddlExecutor.exec( pddl , true);

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
    let path = await PDDL_frozenBFS(pos, objective);
    if (path.length === 1 && fallback) {
        //use normal BFS to find the path
        // console.log("\t[PDDL] No path found, using BFS");
        path = await PDDL_frozenBFS(pos, objective);
        // console.log("\t[PDDL] BFS path", path);
        if (path.length === 1) {
            //fallback to clean BFS
            // console.log("\t[PDDL] No path found, using clean BFS");
            path = await PDDL_cleanBFS(pos, objective);
            // console.log("\t[PDDL] Clean BFS path", path);
        }
    }
    
    // console.log("\t[PDDL] path", path)

    return path;
}

export { PDDL_path };