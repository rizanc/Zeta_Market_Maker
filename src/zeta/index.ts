require("dotenv").config();
import marketMaker from './market-maker';

const cluster = require('cluster')
const os = require('os')

if (cluster.isMaster) {
    cluster.fork()

} else {
    marketMaker.run();
}

cluster.on('exit', (worker) => {
    console.log('mayday! mayday! worker', worker.id, ' is no more!')
    // cluster.fork()
})

