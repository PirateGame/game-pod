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
                console.log("[INFO][" + gameName + "][" + playerName + "] registered ")
                callback({
                    token: token
                })
            }
        })

        socket.on("join", async (playerName: string, gameName: string, token: any, callback: any) => {
            if ( token == await db.getToken(playerName, gameName)) {
                socket.join(gameName)
                console.log("[INFO][" + gameName + "][" + playerName + "] Connected to room ")
                callback({
                    status: true
                })
            } else {
                callback({
                    status: false
                })
            }
        })

        socket.on("getPlayerList", async (playerName, gameName, callback: any) => {
            var playerList = await db.getPlayerlist(gameName)
            console.log("[INFO][" + gameName + "][" + playerName + "] get player list ")
            callback({
                status: "ok",
                playerList: playerList
            })
        })

        socket.on("submitBoard", async (playerName, gameName, board, callback: any) => {
            if (await db.setBoard(playerName, gameName, board) == false){
                console.log("[ERROR]][" + gameName + "][" + playerName + "] set Board failed ")
                callback({
                    status: "Error - Please contact admin"
                })
            } else {
                console.log("[INFO][" + gameName + "][" + playerName + "] set Board ")
                gameReady(gameName)
                callback({
                    status: "ok"
                })
            }
        })

        socket.on("setTeam", async (playerName, gameName, ship, captain, callback: any) => {
            if (await db.setTeam(playerName, gameName, ship, captain) == false){
                console.log("[ERROR]][" + gameName + "][" + playerName + "] set Team failed ")
                callback({
                    status: "Error - Please contact admin"
                })
            } else {
                console.log("[INFO][" + gameName + "][" + playerName + "] set Team ")
                callback({
                    status: "ok"
                })
            }
        })

        socket.on("addAI", (playerName, gameName, token, callback: any) => {
            token = token
            playerName = playerName
            console.log("[INFO][" + gameName + "][" + playerName + "] added AI")
            callback({
                status: "not implemented"
            })
        })

        
    });

    app.all('*', (req: any, res: any) => nextHandler(req, res));

    server.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
    });

    // setInterval(function() {
    //     console.log("running loop")
        
    // }, 5000);

    const gameReady = async(gameName: string) => {
        var ready = true
        await db.getPlayerlist(gameName).then(async(playerList) => {
            for (var player = 0;  player < playerList.length; player ++){
                await db.getPlayerBoard(playerList[player].name, gameName).then((board) => {
                    if (board == null) {
                        return
                    }
                    if (board.board == 0){
                        ready = false
                    }
                })
            }
            if(ready){
                db.setGameState(gameName, 1)
                
                io.in(gameName).emit("gameStateUpdate", 1)
            }
        })
    }
});