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
                socket.join(gameName + playerName)
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
            await db.setBoard(playerName, gameName, board)
            console.log("[INFO][" + gameName + "][" + playerName + "] set Board ")
            gameReady(gameName)
            callback({
                status: "ok"
            })
        })

        socket.on("setTeam", async (playerName, gameName, ship, captain, callback: any) => {
            await db.setTeam(playerName, gameName, ship, captain)
            console.log("[INFO][" + gameName + "][" + playerName + "] set Team ")
            callback({
                status: "ok"
            })
        })

        socket.on("addAI", (playerName, gameName, token, callback: any) => {
            token = token
            playerName = playerName
            console.log("[INFO][" + gameName + "][" + playerName + "] added AI")
            callback({
                status: "not implemented"
            })
        })

        socket.on("startGame", (playerName, gameName, token) => {
            token = token
            playerName = playerName
            console.log("[INFO][" + gameName + "][" + playerName + "] started game")
            start(gameName)
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
                await db.getPlayerBoard(playerList[player], gameName).then((board) => {
                    if (board == null) {
                        return
                    }
                    if (board == 0){
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

    const start = (gameName: string) => {
        console.log("[INFO][" + gameName + "] Started")
        io.in(gameName).emit("gameStart")
        db.setGameTurnNumber(gameName, 1)
        db.setGameState(gameName, 2)
        setInterval(function (){
            //allow clients to move to next page.
            gameLoop(gameName)
          }, 10000);
    }

    const gameLoop = async(gameName: string) => {
        var playerList = await db.getPlayerlist(gameName)
        for (let i = playerList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [playerList[i], playerList[j]] = [playerList[j], playerList[i]];
        }

        var queue = await db.getGameQueue(gameName)
        console.log(queue)

        if (Object.keys(queue).length < 1) {
            var turn = await db.getGameTurn(gameName)
            turn += 1
            var maxTurns = await db.getGameSizeX(gameName) * await db.getGameSizeY(gameName)
            console.log(maxTurns)
            if (turn > maxTurns) {
                //end game
            } else {
                //choose new tile.
                var tilesRemaining: any = await db.getGameTilesRemaining(gameName)
                console.log(tilesRemaining)
                var temp = tilesRemaining[Math.floor(Math.random() * tilesRemaining.length)]
                var currentTile = {"x": temp[0], "y": temp[1]}
                await db.setGameCurrentTile(gameName, currentTile)

                await db.setGameTurn(gameName, turn)
                for (let i = 0; i < playerList.length; i++) {
                    var board: any = await db.getPlayerBoard(playerList[i], gameName)
                    if (board == null || board == undefined){
                        console.log("[ERROR]][" + gameName + "][" + playerList[i] + "] Board Not found")
                        return
                    }
                    console.log(board)
                    for (var tile = 0; tile < board.length; tile ++) {
                        if (board[tile].x == currentTile.x && board[tile].y == currentTile.y) {
                            var money = await db.getPlayerMoney(gameName, playerList[i])
                            var bank = await db.getPlayerBank(gameName, playerList[i])
                            var shield = await db.getPlayerShield(gameName, playerList[i])
                            var mirror = await db.getPlayerMirror(gameName, playerList[i])
                            if(money == undefined || bank == undefined || shield == undefined || mirror == undefined) {
                                console.log("[ERROR][" + gameName + "][" + playerList[i] + "] Could not find all player data")
                                return
                            }
                            if (board[tile].content == "5000") {
                                money += 5000
                                await db.setPlayerMoney(gameName, playerList[i], money)
                                var data = {"title": "You got 5000 Gold Coins"}
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content == "3000") {
                                money += 3000
                                await db.setPlayerMoney(gameName, playerList[i], money)
                                var data = {"title": "You got 3000 Gold Coins"}
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content == "1000") {
                                money += 1000
                                await db.setPlayerMoney(gameName, playerList[i], money)
                                var data = {"title": "You got 1000 Gold Coins"}
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content == "1000") {
                                money += 1000
                                await db.setPlayerMoney(gameName, playerList[i], money)
                                var data = {"title": "You got 1000 Gold Coins"}
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content = "A"){
                                //Rob
                                //emit event
                                //add to queue.
                            } else if (board[tile].content = "B"){
                                //Kill
                            } else if (board[tile].content = "C"){
                                //Present
                            } else if (board[tile].content = "D"){
                                //Skull and Crossbones
                            } else if (board[tile].content = "E"){
                                //Swap
                            } else if (board[tile].content = "F"){
                                //Choose next tile
                            } else if (board[tile].content = "G"){
                                //Shield
                                shield += 1
                                await db.setPlayerShield(playerList[i], gameName, shield)
                                var data = {"title": "You got a Shield"}
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content = "H"){
                                //Mirror
                                mirror += 1
                                await db.setPlayerMirror(playerList[i], gameName, mirror)
                                var data = {"title": "You got a mirror"}
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content = "I"){
                                //Bomb
                                money = 0
                                await db.setPlayerMoney(playerList[i], gameName, money)
                                var data = {"title": "You got Bombed! You lost all your cash"}
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content = "J"){
                                //Double
                                money = money * 2
                                await db.setPlayerMoney(playerList[i], gameName, money)
                                var data = {"title": "You Doubled your cash"}
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content = "K"){
                                //Bank
                                bank += money
                                money = 0
                                await db.setPlayerMoney(playerList[i], gameName, money)
                                await db.setPlayerBank(playerList[i], gameName, bank)
                                var data = {"title": "Your cash has been saved to the bank."}
                                io.in(gameName + playerList[i]).emit("event", data)
                            }
                        }
                    }
                }
            }

            //if turn > max turns end game.
        } else {
            //var task = queue.0
            //if (task.type == "question"){

            //}
        }
    }
});