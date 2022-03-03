require("dotenv").config();

import marketMaker from './market-maker';
import { sleep, info, error } from '../lib';

let t = {
    solBalance: 0,
    name: "Costin"
}
info("\n\n\nStarting zeta");

const cluster = require('cluster')
const os = require('os')

if (cluster.isMaster) {
    cluster.fork();
} else {
    marketMaker.run();
}

cluster.on('exit', (worker) => {

    let sleepTime = 1;

    error(`\n\n\nworker ${worker.id} died, restarting in ${sleepTime}ms`)
    sleep(sleepTime)
        .then(_ => {
            cluster.fork()
        })
})


// uncaught exceptions
process.on('uncaughtException', (err) => {
    error(((err && err.stack) ? err.stack : err));
    throw(err);
});

