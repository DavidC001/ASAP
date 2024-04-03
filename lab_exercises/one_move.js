import {DeliverooApi} from "@unitn-asa/deliveroo-js-client";
import {default as config} from "../config.js";

const client = new DeliverooApi(config.host, config.token)

function distance({x: x1, y: y1}, {x: x2, y: y2}) {
    const dx = Math.abs(Math.round(x1) - Math.round(x2))
    const dy = Math.abs(Math.round(y1) - Math.round(y2))
    return dx + dy;
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
        if (dist > 1) {
            console.log('too far away');
        } else if (dist === 1) {
            let move = '';
            if (p.x > me.x) move = 'right';
            else if (p.x < me.x) move = 'left';
            else if (p.y < me.y) move = 'down';
            else if (p.y > me.y) move = 'up';
            await client.move(move);
            await client.pickup();
            console.log(dist, move);
        }
    }

})


