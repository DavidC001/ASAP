import {DeliverooApi} from "@unitn-asa/deliveroo-js-client";
import {default as config} from "../config.js";

const client = new DeliverooApi(config.host, config.token)

function distance({x: x1, y: y1}, {x: x2, y: y2}) {
    const dx = Math.abs(Math.round(x1) - Math.round(x2))
    const dy = Math.abs(Math.round(y1) - Math.round(y2))
    return dx + dy;
}

function distance_xy({x: x1, y: y1}, {x: x2, y: y2}) {
    const dx = Math.abs(Math.round(x1) - Math.round(x2))
    const dy = Math.abs(Math.round(y1) - Math.round(y2))
    return {dx: dx, dy: dy};
}

async function choose_move(parcel, agent) {
    let move = '';
    if (parcel.x > agent.x) move = 'right';
    else if (parcel.x < agent.x) move = 'left';
    await client.move(move);
    if (parcel.y < agent.y) move = 'down';
    else if (parcel.y > agent.y) move = 'up';
    await client.move(move);
}

const me = {};

client.onYou(({id, name, x, y, score}) => {
    me.id = id
    me.name = name
    me.x = x
    me.y = y
    me.score = score
})

const db = new Map()

client.onParcelsSensing(async (parcels) => {

    const pretty = Array.from(parcels)
        .map(({id, x, y, carriedBy, reward}) => {
            return `(${x},${y},${reward})`; //`(${x},${y},${reward})`
        })
        .join(' ')

    for (const p of parcels) {
        const dist = distance({x: p.x, y: p.y}, {x: me.x, y: me.y});
        if (!p.carriedBy) {
            let move = '';
            let dst_axis = distance_xy(p, me)
            await choose_move(p,me);


            if(p.x===me.x && p.y===me.y) await client.pickup();
            console.log(dist, move);
        }
    }
    //console.log(pretty, me)

})


