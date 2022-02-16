require("dotenv").config();
import marketMaker from './market-maker';

const cluster = require('cluster')
const os = require('os')

if (cluster.isMaster) {
    //const cpuCount = os.cpus().length
    //for (let i = 0; i < cpuCount; i++) {
    cluster.fork()
    //}
} else {
    marketMaker();
}

cluster.on('exit', (worker) => {
    console.log('mayday! mayday! worker', worker.id, ' is no more!')
    cluster.fork()
})
