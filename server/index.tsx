require('dotenv').config()
import express, { Express } from 'express';
import * as http from 'http';
import next, { NextApiHandler } from 'next';
import * as socketio from 'socket.io';
import { dbInteraction } from "./db";
var jwt=require('jsonwebtoken');

let db = new dbInteraction();


if (process.env.PORT) {
    var port: number = parseInt(process.env.PORT);
}


const dev: boolean = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const nextHandler: NextApiHandler = nextApp.getRequestHandler();

nextApp.prepare().then(async() => {
    const app: Express = express();
    const server: http.Server = http.createServer(app);
    const io: socketio.Server = new socketio.Server();
    io.attach(server);

    io.on('connection', async (socket: socketio.Socket) => {
        console.log('connection');
        console.log(socket.id)
        socket.emit('status', 'Hello from Socket.io');

        socket.on('disconnect', () => {
            console.log('client disconnected');
        })

        socket.on("Register", async (playerName: string, gameName: string,callback: any) => {
            var token = jwt.sign({ playerName: playerName }, process.env.JSON_SECRET);
            await db.setToken(playerName, gameName, token)
            callback({
                token: token
            })
        })

        socket.on("test", (callback: any) => {
            callback({
                status: "ok"
            })
        })

        socket.on("addAI", (callback: any) => {
            console.log("addAI request")
            callback({
                status: "not implemented"
            })
        })

        
    });

    app.all('*', (req: any, res: any) => nextHandler(req, res));

    server.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
    });
});