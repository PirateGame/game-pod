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
        socket.on('disconnect', () => {
            socket.disconnect()
        })

        /*
        List of functions and what they do.
        Register:
            gives player token
        join: 
            connects client to room.
        
        */

        socket.on("Register", async (playerName: string, gameName: string,callback: any) => {
            if(playerName == null || gameName == null) {
                console.log("no parameters")
                socket.disconnect()
            }
            var token = jwt.sign({ playerName: playerName }, process.env.JSON_SECRET);
            if (await db.setToken(playerName, gameName, token) == false){
                console.log("set token failed")
                socket.disconnect()
            } else {
                //here we can assume that a new player has joined a game so they can update their player list.
                socket.to(gameName).emit('playerListUpdated')
                socket.join(gameName)
                console.log("[INFO] registered client " + playerName)
                callback({
                    token: token
                })
            }
        })

        socket.on("join", async (playerName: string, gameName: string, token: any, callback: any) => {
            if ( token == await db.getToken(playerName, gameName)) {
                socket.join(gameName)
                console.log("[INFO] connected client " + playerName + " to room " + gameName)
                callback({
                    status: true
                })
            } else {
                callback({
                    status: false
                })
            }
        })

        socket.on("getPlayerList", async (gameName, callback: any) => {
            var playerList = await db.getPlayerlist(gameName)
            callback({
                status: "ok",
                playerList: playerList
            })
        })

        socket.on("addAI", (playerName, gameName, token, callback: any) => {
            token = token
            playerName = playerName
            console.log("[INFO] added AI to " + gameName)
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