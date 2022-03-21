require("dotenv").config();

import hedger from './hedger';
import { sleep, info, error } from '../lib';

info("\n\n\nStarting Hedger");

const cluster = require('cluster')

if (cluster.isMaster) {
    cluster.fork();
} else {
    hedger.run();
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

