require("dotenv").config();

import {
    Wallet,
    Client,
    Exchange,
    Network,
    utils,
    types,
    events

} from "@zetamarkets/sdk";

import { PublicKey, Connection, Keypair } from "@solana/web3.js";

const WS_SERVER_PORT = 8000;
const SLEEP_MS: number = parseInt(process.env.SLEEP_MS) || 25000;
const NETWORK_URL = process.env["network_url"]!;
const PROGRAM_ID = new PublicKey(process.env["program_id"]);

import * as websocket from 'websocket';
import * as http from 'http';

export const runWebSocketServer = async () => {

    await connectToZeta();

    const webSocketServer = websocket.server;
    const server = http.createServer();
    server.listen(WS_SERVER_PORT);

    const wsServer = new webSocketServer({
        httpServer: server
    });

    console.log('WebSocket server is running on port ' + WS_SERVER_PORT);

    wsServer.on('request', function (request: any) {
        var userID = getUniqueID();
        console.log((new Date()) + ' Recieved a new connection from origin ' + request.origin + '.');
        // You can rewrite this part of the code to accept only the requests from allowed origin
        const connection = request.accept(null, request.origin);
        connection.on('message', function (message) {
            if (message.type === 'utf8') {
                console.log('Received Message: ' + message.utf8Data);
                //connection.sendUTF(message.utf8Data);
            }
            else if (message.type === 'binary') {
                console.log('Received Binary Message of ' + message.binaryData.length + ' bytes');
                //connection.sendBytes(message.binaryData);
            }
        });
        connection.on('close', function (reasonCode, description) {
            console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
        });

        connection.on('pong', function (data) {
            console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' PONGED.');
        });

        clients[userID] = connection;
        console.log('connected: ' + userID + ' in ' + Object.getOwnPropertyNames(clients))
    });

}

let zetaClient;

const clients: any = {};

const getUniqueID = () => {
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return s4() + s4() + '-' + s4();
};

const sendMessage = (json: any) => {
    Object.keys(clients).map((client) => {
        clients[client].sendUTF(json);
    });
}

const connectToZeta = async () => {

    const userKey = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(Buffer.from(process.env.private_key!).toString()))
    );

    const wallet = new Wallet(userKey);

    const connection: Connection = new Connection(NETWORK_URL, "confirmed");

    await Exchange.load(
        PROGRAM_ID,
        Network.MAINNET,
        connection,
        utils.defaultCommitment(),
        new types.DummyWallet(), 100,
        async (event: events.EventType, data: any) => {

            switch (event) {
                case events.EventType.ORDERBOOK:
                    let marketIndex = data.marketIndex;
                    let markets = Exchange.markets;
                    let market = markets.markets[marketIndex];
                    let orderbook = market.orderbook;
                    await zetaClient.updateState();

                    console.log("======= ORDERBOOK ==========")
                    console.log("Market Index ", marketIndex);
                    console.log(orderbook);
                    sendMessage(JSON.stringify(orderbook));

                    console.log(".=================")

                default:
                    return;
            }
        }

    );

    Exchange.markets.subscribeMarket(28);
    Exchange.markets.pollInterval = 5;

    zetaClient = await Client.load(
        connection,
        wallet,
        utils.defaultCommitment()

    );

    // zetaClient.pollInterval = 10;


    await zetaClient.updateState();
    utils.displayState();
}


runWebSocketServer();