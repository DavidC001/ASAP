import {senseParcels, updateParcels} from "./parcels/parcels.js";

const me = {};

function updateMe({id, name, x, y, score}) {
    me.id = id;
    me.name = name;
    me.x = x;
    me.y = y;
    me.score = score;
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
}

export {RegisterBeliefsRevisions}