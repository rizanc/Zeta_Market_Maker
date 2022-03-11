const WS_SERVER_PORT = 8000;

import * as websocket from 'websocket';
import * as http from 'http';

export const runWebSocketServer = () => {

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
        sendMessage("1 Hello there!!");
        sendMessage("2 Hello there!!");
        sendMessage("3 Hello there!!");
        sendMessage("4 Hello there!!");
        sendMessage("5 Hello there!!");
        sendMessage("6 Hello there!!");
    });

}

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


