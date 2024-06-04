import fetch from 'node-fetch' // import fetch from 'node-fetch';

const HOST = process.env.PAAS_HOST || 'https://solver.planning.domains:5001';
const PATH = process.env.PAAS_PATH || '/package/dual-bfws-ffparser/solve';

/**
 * @typedef { { parallel: boolean, action: string, args: string [] } } pddlPlanStep
 */


/**
 * @param {String} pddlDomain 
 * @param {String} pddlProblem 
 * @returns { Promise < pddlPlanStep [] > }
 */
export default async function onlineSolver (pddlDomain, pddlProblem) {

    // var responseCheckUrl = await postRequest(pddlDomain, pddlProblem);

    var json = await getResult(pddlDomain, pddlProblem);
    if (json == "") return [];

    var plan = parsePlan(json);
    
    return plan;
}


async function postRequest (pddlDomain, pddlProblem) {

    if ( typeof pddlDomain !== 'string' && ! pddlDomain instanceof String )
        throw new Error( 'pddlDomain is not a string' );

    if ( typeof pddlProblem !== 'string' && ! pddlProblem instanceof String )
        throw new Error( 'pddlProblem is not a string' );

    
    // console.log( 'POSTING planning request to', HOST + PATH );
    
    var res = await fetch( HOST + PATH, {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify( {domain: pddlDomain, problem: pddlProblem} )
    })
    
    if ( res.status != 200 ) {
        throw new Error( `Error at ${ HOST + PATH } ${ await res.text() }` );
    }

    var json = await res.json();
    
    // console.log(res);

    if ( ! json.result ) {
        console.log(res);
        throw new Error( `No value "result" from ${ HOST + PATH } ` + res );
    }

    return HOST + json.result;
}


async function getResult (pddlDomain, pddlProblem) {
    if ( typeof pddlDomain !== 'string' && ! pddlDomain instanceof String )
        throw new Error( 'pddlDomain is not a string' );

    if ( typeof pddlProblem !== 'string' && ! pddlProblem instanceof String )
        throw new Error( 'pddlProblem is not a string' );

    while (true) {

        // console.log('PENDING planning result from', responseCheckUrl);

        let res = await fetch( HOST + PATH, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify( {domain: pddlDomain, problem: pddlProblem} )
        })

        if ( res.status != 200 ) {
            throw new Error( `Received HTTP error from ${ HOST + res.result } ` + await res.text() );
        }
    
        var json = await res.json();

        if ( json.status === 'PENDING') {
            await new Promise( (res, rej) => setTimeout(res, 100) );
        }
        else
            break;

    }

    // console.log(json);
    // console.log(json.plans[0].result);
    // console.log(json.plans[0].result.plan);

    
    if ( ! 'stdout' in json ) {
        console.log(json);
        throw new Error( `No 'result.stdout' in response` );
    }

    return json;

}


async function parsePlan (json) {

    /**@type {[string]}*/
    var lines = [];
    if(json.plan==='') return [];
    if ( json.plan ) {
        lines = json.plan.split('\n');
    }
    // PARSING plan from /package/dual-bfws-ffparser/solve
    if ( json.stdout.split('\n').includes(' --- OK.') ) {

        // console.log( '\tUsing parser for /package/dual-bfws-ffparser/solve');

        lines = lines.map( line => line.replace('(','').replace(')','').split(' ') );
        lines = lines.slice(0,-1);
    }

    // PARSING plan from /package/delfi/solve
    else if ( json.call.split(' ').includes('delfi') && json.result.stdout.split('\n').includes('Solution found.') ) {
        
        // console.log( '\tUsing parser for /package/delfi/solve');

        lines = lines.map( line => line.replace('(','').replace(')','').split(' ') );
        lines = lines.slice(0,-1);
    }

    // PARSING plan from /package/enhsp-2020/solve
    else if ( lines.includes('Problem Solved') ) {

        // console.log( '\tUsing parser for /package/enhsp-2020/solve');

        let startIndex = lines.indexOf('Problem Solved') + 1;
        let endIndex = lines.findIndex( (line) => line.includes('Plan-Length') );
        lines = lines.slice( startIndex, endIndex );
        
        lines = lines.map( line => line.replace('(','').replace(')','').split(' ').slice(1) );
    }

    // PARSING plan from /package/optic/solve
    else if ( json.call.split(' ').includes('optic') && lines.includes(';;;; Solution Found') ) {
        
        // console.log( '\tUsing parser for /package/optic/solve');
        
        let startIndex = lines.indexOf(';;;; Solution Found') + 1;
        lines = lines.slice( startIndex + 3 );

        lines = lines.map( line => line.replace('(','').replace(')','').split(' ').slice(1, -1) );
        lines = lines.slice(0,-1);
    }

    // PARSING plan from /package/lama-first/solve
    else if ( json.call.split(' ').includes('lama-first')&& json.result.stdout.includes('Solution found!') ) {
        
        // console.log( '\tUsing parser for /package/lama-first/solve');

        lines = json.output.sas_plan.split('\n').slice(0,-2);
        lines = lines.map( line => line.replace('(','').replace(')','').split(' ') );
    }

    // ERROR
    else {
        // console.log(json);
        // console.error( '\tPlan not found!' )
        return;
    }

    var plan = []

    // console.log( '\tPlan found!' )

    for ( let /**@type {string}*/ line of lines ) {

        // console.log('- ' + line);

        // var number = line.shift()
        var action = line.shift()
        var args = line
        
        plan.push( { parallel: false/*number==previousNumber*/, action: action, args: args } );
    }
    
    return plan;

}