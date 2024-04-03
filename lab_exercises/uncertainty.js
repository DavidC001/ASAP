import {DeliverooApi} from "@unitn-asa/deliveroo-js-client";
import {default as config} from "../config.js";

const client = new DeliverooApi(config.host, config.token)

const start = Date.now();


const me = {};

client.onYou(({id, name, x, y, score}) => {
    me.id = id
    me.name = name
    me.x = x
    me.y = y
    me.score = score
})

function distance({x: x1, y: y1}, {x: x2, y: y2}) {
    const dx = Math.abs(Math.round(x1) - Math.round(x2))
    const dy = Math.abs(Math.round(y1) - Math.round(y2))
    return dx + dy;
}

/**
 * @type {Map<string,[{id,name,x,y,score}]}
 */
const db = new Map()

client.onAgentsSensing((agents) => {

    for (const a of agents) {
        const timestamp = Date.now() - start;
        if (a.x % 1 !== 0 || a.y % 1 !== 0) // skip intermediate values (0.6 or 0.4)
            continue;

        // I meet someone for the first time
        if (!db.has(a.id)) {
            db.set(a.id, [])
            console.log('Met ' + a.name + ' for the first time', db.get(a.id));
        } else { // I remember him
            console.log("Already met " + a.name, db.get(a.id));
        }
        if (db.get(a.id).length > 5) db.get(a.id).shift();
        db.get(a.id).push({x: a.x, y: a.y, name: a.name, timestamp: timestamp})
    }

    for (const [id, history] of db.entries()) {

        const last = history[history.length - 1]
        const second_last = (history.length > 1 ? history[history.length - 2] : 'no knowledge')
        if (!agents.map(a => a.id).includes(id)) {
            // If I am not seeing him anymore
            console.log(last.name + " disappeared at [" + last.x + "," + last.y + "]");

        } else { // If I am still seing him ... see above
            console.log('still seing ' + last.name + " at [" + last.x + "," + last.y + "]")
            if (second_last.x===last.x && second_last.y===last.y){
                console.log("Agent " + last.name +" is not moving")
            }
            else if(second_last.y>last.y){console.log("Agent " + last.name +" is moving down") }
            else if(second_last.y<last.y){console.log("Agent " + last.name +" is moving up") }
            else if(second_last.x>last.x){console.log("Agent " + last.name +" is moving left") }
            else if(second_last.x<last.x){console.log("Agent " + last.name +" is moving right") }
        }

    }

})


/**
 * 30/03/2023
 * Implement beliefset revision so to:
 *
 // I meet someone for the first time
 console.log( 'Hello', a.name )

 // I already met him in the past

 // I was seeing him also last time

 // But he moved
 console.log( 'I\'m seeing you moving', a.name )

 // Or he did not moved
 console.log(  )

 // I see him again after some time

 // Seems that he moved
 console.log( 'Welcome back, seems that you moved', a.name )

 // As far as I remember he is still here
 console.log( 'Welcome back, seems you are still here as before', a.name )

 // I am perceiving (eventually no one is around me) and seems that I am not seeing him anymore

 // He just went off, right now
 console.log( 'Bye', last.name );

 // It's already a while since last time I saw him
 console.log( 'Its a while that I don\'t see', second_last.name, 'I remember him in', second_last.x, second_last.y );

 // I'm back where I remember I saw himlast time
 console.log( 'I remember', second_last.name, 'was within 3 tiles from here. Forget him.' );
 *
 *
 */