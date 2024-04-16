import {getParcels, senseParcels} from "./parcels/parcels.js";
import {createMap} from "./map/map.js";

const me = {};

function updateMe({id, name, x, y, score}) {
    me.id = id;
    me.name = name;
    me.x = x;
    me.y = y;
    me.score = score;
}

function distance({x: x1, y: y1}, {x: x2, y: y2}) {
    const dx = Math.abs(Math.round(x1) - Math.round(x2))
    const dy = Math.abs(Math.round(y1) - Math.round(y2))
    return dx + dy;
}


function RegisterBeliefsRevisions(client) {
    client.onYou(updateMe);
    me.config = client.config;

    let interval = me.config.PARCEL_DECADING_INTERVAL.match(/(\d+)(\w+)/);
    switch (interval[2]) {
        case 'ms':
            interval = interval[1];
            break;
        case 's':
            interval = interval[1] * 1000;
            break;
        case 'm':
            interval = interval[1] * 60 * 1000;
            break;
        default:
            console.log('Invalid time interval');
    }

    client.onParcelsSensing(async (perceived_parcels) => {
        senseParcels(perceived_parcels, interval);
    })

    client.onMap(async (width, height, tiles) => {
        createMap({width, height, tiles});
    })
}

export {RegisterBeliefsRevisions, me, distance}