require('dotenv').config()
import express, { Express } from 'express';
import * as http from 'http';
import next, { NextApiHandler } from 'next';
import * as socketio from 'socket.io';

//This should be .jsx for server and empty for dev env
import { dbInteraction } from './db.jsx';
var jwt = require('jsonwebtoken');

let db = new dbInteraction();

interface task {
    initiator: string,
    target: string,
    responder: string,
    type: string,
    title?: string,
    timeout: number,
    response?: string,
    options?: string[],
    mirrored?: number,
    shielded?: boolean,
    emitted?: boolean,
}

interface tileQueue {
    tile: number
}

interface score {
    [key: string]: string | number
}


if (process.env.PORT) {
    var port: number = parseInt(process.env.PORT);
}

const dev: boolean = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const nextHandler: NextApiHandler = nextApp.getRequestHandler();

nextApp.prepare().then(async () => {
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

        socket.on("Register", async (gameName: string, playerName: string, callback: any) => {
            if (playerName == null || gameName == null) {
                console.log("no parameters")
                socket.disconnect()
            } else {
                var token = jwt.sign({ playerName: playerName }, process.env.JSON_SECRET);
                if (await db.setToken(gameName, playerName, token) == false) {
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
            }
        })

        socket.on("join", async (gameName: string, playerName: string, token: any, callback: any) => {
            if (token == await db.getToken(gameName, playerName)) {
                socket.join(gameName)
                socket.join(gameName + playerName)
                console.log("[INFO][" + gameName + "][" + playerName + "] Connected to room ")
                callback({
                    status: true
                })
            } else {
                console.log("[WARN][" + gameName + "][" + playerName + "] could not connect to room ")
                callback({
                    status: false
                })
            }
        })

        socket.on("getPlayerList", async (gameName, playerName, callback: any) => {
            var playerList = await db.getPlayerlist(gameName)
            console.log("[INFO][" + gameName + "][" + playerName + "] get player list ")
            callback({
                status: "ok",
                playerList: playerList
            })
        })

        socket.on("submitBoard", async (gameName, playerName, board, callback: any) => {
            await db.setBoard(gameName, playerName, board)
            console.log("[INFO][" + gameName + "][" + playerName + "] set Board ")
            gameReady(gameName)
            callback({
                status: "ok"
            })
        })

        socket.on("setTeam", async (gameName, playerName, ship, captain, callback: any) => {
            await db.setTeam(gameName, playerName, ship, captain)
            console.log("[INFO][" + gameName + "][" + playerName + "] set Team ")
            callback({
                status: "ok"
            })
        })

        socket.on("addAI", async (gameName, playerName, token, callback: any) => {
            token = token
            playerName = playerName
            console.log("[INFO][" + gameName + "][" + playerName + "] added AI")
            if (await db.addAI(gameName)) {
                socket.to(gameName).emit('playerListUpdated')
                callback({
                    status: "AI Player Added"
                })
            } else {
                callback({
                    status: "Max number of AI players reached."
                })
            }

        })

        socket.on("startGame", (gameName, playerName, token) => {
            token = token
            playerName = playerName
            console.log("[INFO][" + gameName + "][" + playerName + "] started game")
            start(gameName)
        })

        socket.on("questionResponse", async (gameName, playerName, option) => {
            console.log("[INFO][" + gameName + "][" + playerName + "] received option.")

            var queue = await db.getGameQueue(gameName) as object[]

            for (var i in queue) {
                //only one task should be open for player.
                //but this will probably choose the first task.
                var task: task = queue[i] as task
                if (task.responder == playerName) {
                    task.response = option
                }
                queue[i] = task
                break
            }

            await db.setGameQueue(gameName, queue)


        })


    });

    app.all('*', (req: any, res: any) => nextHandler(req, res));

    server.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
    });

    const gameReady = async (gameName: string) => {
        var ready = true
        await db.getPlayerlist(gameName).then(async (playerList) => {
            for (var player = 0; player < playerList.length; player++) {
                await db.getPlayerBoard(gameName, playerList[player]).then((board) => {
                    if (board == null) {
                        return
                    }
                    if (board == 0) {
                        ready = false
                    }
                })
            }
            if (ready) {
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
        setTimeout(function () {
            //allow clients to move to next page.
            gameLoop(gameName)
        }, 10000);
    }

    const gameLoop = async (gameName: string) => {
        var playerList = await db.getPlayerlist(gameName)
        //if playerlist empty assume game has been deleted. so stop
        if (playerList.length < 1) {
            console.log("[WARN][" + gameName + "] Appears to have been deleted")
            return
        }
        for (var i = playerList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [playerList[i], playerList[j]] = [playerList[j], playerList[i]];
        }

        var queue = await db.getGameQueue(gameName) as object[]
        console.log("[Info][" + gameName + "] Game loop")

        var decisionTime = await db.getGameDecisionTime(gameName) * 1000

        if (queue.length < 1) {
            var turn = await db.getGameTurn(gameName)

            //write scores to db
            var scores: score = {}
            for (var i = 0; i < playerList.length; i++) {
                var money = await db.getPlayerMoney(gameName, playerList[i])
                var bank = await db.getPlayerBank(gameName, playerList[i])
                if (money == undefined || bank == undefined) {
                    console.log("[ERROR][1][" + gameName + "] saving scores to db")
                    return
                }
                scores[playerList[i]] = money + bank
            }

            addToScoreHistory(gameName, turn, scores)

            turn += 1
            await db.setGameTurn(gameName, turn)
            var maxTurns = await db.getGameSizeX(gameName) * await db.getGameSizeY(gameName)
            if (turn > maxTurns + 1) { //need to do the last turn.
                var data = { "title": "Game Over." }
                io.in(gameName).emit("event", data)
                console.log("[INFO]][" + gameName + "] Finished")
                return
            } else {
                var tileQueue = await db.getGameTileQueue(gameName) as object[]
                var tilesRemaining: number[] = await db.getGameTilesRemaining(gameName)
                var currentTile: number
                if (tileQueue.length > 0) {
                    //tile in queue
                    console.log("using tile from queue")
                    var temp = tileQueue[0] as tileQueue
                    currentTile = temp.tile

                    tileQueue.shift()

                    await db.setGameTileQueue(gameName, tileQueue)

                } else {
                    //choose new tile.
                    if (tilesRemaining == undefined) {
                        console.log("[ERROR][2][" + gameName + "] tilesRemaing Not found")
                        return
                    }
                    currentTile = tilesRemaining[Math.floor(Math.random() * tilesRemaining.length)]

                    tilesRemaining.splice(tilesRemaining.indexOf(currentTile), 1)

                    await db.setGameTilesRemaining(gameName, tilesRemaining)
                }

                console.log("[Info][" + gameName + "] " + currentTile)


                await db.setGameCurrentTile(gameName, currentTile)

                for (var i = 0; i < playerList.length; i++) {
                    var board: any = await db.getPlayerBoard(gameName, playerList[i])
                    if (board == null || board == undefined) {
                        console.log("[ERROR][3][" + gameName + "][" + playerList[i] + "] Board Not found")
                    }
                    for (var tile = 0; tile < board.length; tile++) {
                        if (board[tile].id == currentTile) {
                            //from here
                            var money = await db.getPlayerMoney(gameName, playerList[i])
                            var bank = await db.getPlayerBank(gameName, playerList[i])
                            var shield = await db.getPlayerShield(gameName, playerList[i])
                            var mirror = await db.getPlayerMirror(gameName, playerList[i])

                            var enemyList = JSON.parse(JSON.stringify(playerList))

                            enemyList.splice(i, 1)


                            if (money == undefined || bank == undefined || shield == undefined || mirror == undefined) {
                                console.log("[ERROR][4][" + gameName + "][" + playerList[i] + "] Could not find all player data")
                                return
                            }

                            //to here
                            if (board[tile].content == "5000") {
                                money += 5000
                                await db.setPlayerMoney(gameName, playerList[i], money)
                                var data = { "title": "You got 5000 Gold Coins" }
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content == "3000") {
                                money += 3000
                                await db.setPlayerMoney(gameName, playerList[i], money)
                                var data = { "title": "You got 3000 Gold Coins" }
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content == "1000") {
                                money += 1000
                                await db.setPlayerMoney(gameName, playerList[i], money)
                                var data = { "title": "You got 1000 Gold Coins" }
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content == "200") {
                                money += 200
                                await db.setPlayerMoney(gameName, playerList[i], money)
                                var data = { "title": "You got 200 Gold Coins" }
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content == "Steal") {
                                //Rob
                                var data = { "title": "You get to steal from someone this turn" }
                                io.in(gameName + playerList[i]).emit("event", data)
                                var job: task = {
                                    initiator: playerList[i],
                                    responder: playerList[i],
                                    type: "Steal",
                                    mirrored: 0,
                                    shielded: false,
                                    target: "",
                                    title: "Who do you want to steal from?",
                                    timeout: Date.now() + decisionTime,
                                    response: undefined,
                                    emitted: false,
                                    options: enemyList
                                }

                                addToQueue(gameName, job)
                            } else if (board[tile].content == "Kill") {
                                //Kill
                                var data = { "title": "You get to kill someone this turn" }
                                io.in(gameName + playerList[i]).emit("event", data)
                                var job: task = {
                                    initiator: playerList[i],
                                    responder: playerList[i],
                                    type: "Kill",
                                    mirrored: 0,
                                    shielded: false,
                                    target: "",
                                    title: "Who do you want to kill?",
                                    timeout: Date.now() + decisionTime,
                                    response: undefined,
                                    emitted: false,
                                    options: enemyList
                                }
                                addToQueue(gameName, job)
                            } else if (board[tile].content == "Present") {
                                //Present
                                var data = { "title": "You get to give a present someone this turn" }
                                io.in(gameName + playerList[i]).emit("event", data)
                                var job: task = {
                                    initiator: playerList[i],
                                    responder: playerList[i],
                                    type: "Present",
                                    title: "Who do you want to give a present to?",
                                    timeout: Date.now() + decisionTime,
                                    response: undefined,
                                    emitted: false,
                                    shielded: false,
                                    target: "",
                                    mirrored: 0,
                                    options: enemyList
                                }
                                addToQueue(gameName, job)
                            } else if (board[tile].content == "Skull and Crossbones") {
                                //Skull and Crossbones
                                var data = { "title": "Skull and cross bones not implemented" }
                                io.in(gameName + playerList[i]).emit("event", data)
                                // addToQueue(gameName, {
                                //     playerName: playerList[i],
                                //     type: "Skull and Crossbones",
                                //     mirrored: 0,
                                //     shielded: false,
                                //     target: "",
                                //     title: "which team do you want to kill?",
                                //     timeout: Date.now() + decisionTime,
                                //     response: null,
                                //     emitted: false,
                                //     options: ["1", "2", "3", "A", "B", "C"]
                                // })
                            } else if (board[tile].content == "Swap") {
                                //Swap
                                var data = { "title": "You get to swap with someone this turn" }
                                io.in(gameName + playerList[i]).emit("event", data)
                                var job: task = {
                                    initiator: playerList[i],
                                    responder: playerList[i],
                                    type: "Swap",
                                    mirrored: 0,
                                    shielded: false,
                                    target: "",
                                    timeout: Date.now() + decisionTime,
                                    title: "Who do you want to swap with?",
                                    response: undefined,
                                    emitted: false,
                                    options: enemyList
                                }
                                addToQueue(gameName, job)
                            } else if (board[tile].content == "Choose Next Tile") {
                                //Choose next tile
                                var data = { "title": "You get to choose the next tile" }
                                io.in(gameName + playerList[i]).emit("event", data)

                                var job: task = {
                                    initiator: playerList[i],
                                    responder: playerList[i],
                                    type: "Choose Next Tile",
                                    title: "Which tile do you want next?",
                                    timeout: Date.now() + decisionTime,
                                    response: undefined,
                                    emitted: false,
                                    options: tilesRemaining.map(String),
                                    target: "",
                                    mirrored: 0,
                                    shielded: false,
                                }
                                addToQueue(gameName, job)
                            } else if (board[tile].content == "Shield") {
                                //Shield
                                shield += 1
                                await db.setPlayerShield(gameName, playerList[i], shield)
                                var data = { "title": "You got a Shield" }
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content == "Mirror") {
                                //Mirror
                                mirror += 1
                                await db.setPlayerMirror(gameName, playerList[i], mirror)
                                var data = { "title": "You got a mirror" }
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content == "Bomb") {
                                //Bomb
                                money = 0
                                await db.setPlayerMoney(gameName, playerList[i], money)
                                var data = { "title": "You got Bombed! You lost all your stash" }
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content == "Double") {
                                //Double
                                money = money * 2
                                await db.setPlayerMoney(gameName, playerList[i], money)
                                var data = { "title": "You Doubled your stash" }
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content == "Bank") {
                                //Bank
                                bank += money
                                money = 0
                                await db.setPlayerMoney(gameName, playerList[i], money)
                                await db.setPlayerBank(gameName, playerList[i], bank)
                                var data = { "title": "Your stash has been saved to the chest." }
                                io.in(gameName + playerList[i]).emit("event", data)
                            }
                        }
                    }
                }
            }

        } else {
            //queue is longer than 0
            var task: task = queue[0] as task
            queue.shift()
            await db.setGameQueue(gameName, queue)

            if (task.timeout == null || task.options == null || task.mirrored == null || task.initiator == null || task.target == null) {
                console.log("[ERROR][5][" + gameName + "] + task did not have all data")
                return
            }
            if (task.emitted == false) {
                if (await db.getPlayerType(gameName, task.responder)) {
                    //AI
                    task.emitted = true
                    task.response = task.options[Math.floor(Math.random() * task.options.length)];
                    task.timeout = Date.now() + 1000

                    queue.unshift(task)
                    await db.setGameQueue(gameName, queue)
                } else {
                    //human
                    console.log("emitting question")
                    io.in(gameName + task.responder).emit("question", task.title, task.options)
                    task.emitted = true

                    task.timeout = Date.now() + decisionTime

                    queue.unshift(task)
                    await db.setGameQueue(gameName, queue)
                }

            } else if (task.response != null) {
                //we have an answer.
                if (task.type == "Present") {
                    //Present
                    var money = await db.getPlayerMoney(gameName, task.response)
                    if (money == undefined || money == null) {
                        console.log("[ERROR][6][" + gameName + "] player money Null")
                        console.log(task.response)
                        return
                    }
                    money += 1000
                    await db.setPlayerMoney(gameName, task.response, money)
                    var data = { "title": "You gave a present to " + task.response }
                    io.in(gameName + task.initiator).emit("event", data)
                    var data = { "title": "You got a present from " + task.initiator }
                    io.in(gameName + task.response).emit("event", data)

                } else if (task.type == "Choose Next Tile") {
                    console.log("adding tile to queue")
                    await addToTileQueue(gameName, { tile: parseInt(task.response) })
                    var tilesRemaining: number[] = await db.getGameTilesRemaining(gameName)
                    tilesRemaining.splice(tilesRemaining.indexOf(parseInt(task.response)), 1)

                    await db.setGameTilesRemaining(gameName, tilesRemaining)

                } else if (task.response == "Do Nothing") {
                    //this means we can perform the action.
                    if (task.mirrored % 2 == 0) {
                        //mirrored even number of times, so performed on target
                        if (task.type == "Steal") {
                            //rob
                            var initiatorMoney = await db.getPlayerMoney(gameName, task.initiator)
                            var targetMoney = await db.getPlayerMoney(gameName, task.target)
                            if (targetMoney == null || initiatorMoney == null) {
                                console.log("[ERROR][7][" + gameName + "] item null")
                                return
                            }

                            initiatorMoney += targetMoney
                            targetMoney = 0
                            await db.setPlayerMoney(gameName, task.initiator, initiatorMoney)
                            await db.setPlayerMoney(gameName, task.target, targetMoney)
                            var data = { "title": "You robbed " + task.target }
                            io.in(gameName + task.initiator).emit("event", data)
                            var data = { "title": "You were robbed by " + task.initiator }
                            io.in(gameName + task.target).emit("event", data)
                        } else if (task.type == "Kill") {
                            //kill
                            await db.setPlayerMoney(gameName, task.target, 0)
                            var data = { "title": "You killed " + task.target }
                            io.in(gameName + task.initiator).emit("event", data)
                            var data = { "title": "You were killed by " + task.initiator }
                            io.in(gameName + task.target).emit("event", data)
                        } else if (task.type == "Skull and Crossbones") {
                            //skull and crossbones
                            console.log("[ERROR][8][" + gameName + "] Team task not implememted")
                        } else if (task.type == "Swap") {
                            //swap
                            var initiatorMoney = await db.getPlayerMoney(gameName, task.initiator)
                            var targetMoney = await db.getPlayerMoney(gameName, task.target)
                            if (targetMoney == null || initiatorMoney == null) {
                                console.log("[ERROR][9][" + gameName + "] items null")
                                console.log(task.target)
                                console.log(task.initiator)
                                return
                            }
                            var middle: number = targetMoney
                            targetMoney = initiatorMoney
                            initiatorMoney = middle
                            await db.setPlayerMoney(gameName, task.initiator, initiatorMoney)
                            await db.setPlayerMoney(gameName, task.target, targetMoney)
                            var data = { "title": "You swapped with " + task.target }
                            io.in(gameName + task.initiator).emit("event", data)
                            var data = { "title": "You swapped with " + task.initiator }
                            io.in(gameName + task.target).emit("event", data)
                        }
                    } else {
                        //mirrored odd number of times, so performed on initiator
                        if (task.type == "Steal") {
                            //rob
                            var initiatorMoney = await db.getPlayerMoney(gameName, task.initiator)
                            var targetMoney = await db.getPlayerMoney(gameName, task.target)
                            if (targetMoney == null || initiatorMoney == null) {
                                console.log("[ERROR][10][" + gameName + "] items null at do nohing")
                                return
                            }
                            targetMoney += initiatorMoney
                            initiatorMoney = 0
                            await db.setPlayerMoney(gameName, task.initiator, initiatorMoney)
                            await db.setPlayerMoney(gameName, task.target, targetMoney)
                            var data = { "title": "You were robbed by " + task.target }
                            io.in(gameName + task.initiator).emit("event", data)
                            var data = { "title": "You robbed " + task.initiator }
                            io.in(gameName + task.target).emit("event", data)
                        } else if (task.type == "Kill") {
                            //kill
                            await db.setPlayerMoney(gameName, task.initiator, 0)
                            var data = { "title": "You were killed by " + task.target }
                            io.in(gameName + task.initiator).emit("event", data)
                            var data = { "title": "You killed " + task.initiator }
                            io.in(gameName + task.target).emit("event", data)
                        } else if (task.type == "Skull and Crossbones") {
                            console.log("[ERROR][11][" + gameName + "] Team task not implemented")
                        } else if (task.type == "Swap") {
                            //swap
                            var initiatorMoney = await db.getPlayerMoney(gameName, task.initiator)
                            var targetMoney = await db.getPlayerMoney(gameName, task.target)
                            if (targetMoney == null || initiatorMoney == null) {
                                console.log("[ERROR][12][" + gameName + "] items null")
                                return
                            }
                            var middle: number = targetMoney
                            targetMoney = initiatorMoney
                            initiatorMoney = middle
                            await db.setPlayerMoney(gameName, task.initiator, initiatorMoney)
                            await db.setPlayerMoney(gameName, task.target, targetMoney)
                            var data = { "title": "You swapped with " + task.target }
                            io.in(gameName + task.initiator).emit("event", data)
                            var data = { "title": "You swapped with " + task.initiator }
                            io.in(gameName + task.target).emit("event", data)
                        }
                    }
                } else if (task.response == "Shield") {
                    //action blocked.

                    if (task.mirrored % 2 == 0) {
                        var shield = await db.getPlayerShield(gameName, task.target)
                        if (shield == null) {
                            console.log("[ERROR][13][" + gameName + "] items null")
                            return
                        }
                        shield -= 1
                        await db.setPlayerShield(gameName, task.target, shield)

                        var data = { "title": "You used a shield to block " + task.initiator }
                        io.in(gameName + task.target).emit("event", data)
                        var data = { "title": task.target + " blocked the attack with a shield" }
                        io.in(gameName + task.initiator).emit("event", data)


                    } else {
                        var shield = await db.getPlayerShield(gameName, task.initiator)

                        if (shield == null) {
                            console.log("[ERROR][14][" + gameName + "] items null")
                            return
                        }
                        shield -= 1
                        db.setPlayerShield(gameName, task.initiator, shield)

                        var data = { "title": "You used a shield to block " + task.target }
                        io.in(gameName + task.initiator).emit("event", data)
                        var data = { "title": task.initiator + " blocked the attack with a shield" }
                        io.in(gameName + task.target).emit("event", data)


                    }
                } else if (task.response == "Mirror") {
                    task.mirrored += 1

                    if (task.mirrored % 2 == 0) {
                        var mirror = await db.getPlayerMirror(gameName, task.initiator)
                        if (mirror == null) {
                            console.log("[ERROR][15][" + gameName + "] items null")
                            console.log(task.initiator)
                            return
                        }
                        mirror -= 1
                        db.setPlayerMirror(gameName, task.initiator, mirror)

                        var data = { "title": "You used a mirror to reflect " + task.target }
                        io.in(gameName + task.initiator).emit("event", data)
                        var data = { "title": task.initiator + " reflected the attack back at you with a mirror" }
                        io.in(gameName + task.target).emit("event", data)

                        var options = ["Do Nothing"]
                        var mirror = await db.getPlayerMirror(gameName, task.target)
                        var shield = await db.getPlayerShield(gameName, task.target)
                        if (mirror == null || shield == null) {
                            console.log("[ERROR][16][" + gameName + "] items null")
                            console.log(task.target)
                            return
                        }
                        if (mirror > 0) {
                            options.push("Mirror")
                        }
                        if (shield > 0) {
                            options.push("Shield")
                        }

                        var newTask: task = {
                            initiator: task.initiator,
                            responder: task.target,
                            type: task.type,
                            mirrored: task.mirrored,
                            shielded: task.shielded,
                            target: task.target,
                            timeout: Date.now() + decisionTime,
                            response: undefined,
                            emitted: false,
                            options: options,
                            title: "How are you going to respond to this?"
                        }
                        queue.unshift(newTask)
                        await db.setGameQueue(gameName, queue)

                    } else {
                        var mirror = await db.getPlayerMirror(gameName, task.target)
                        if (mirror == null) {
                            console.log("[ERROR][17][" + gameName + "] items null")
                            console.log(task.target)
                            return
                        }
                        mirror -= 1
                        db.setPlayerMirror(gameName, task.target, mirror)

                        var data = { "title": "You used a mirror to reflect " + task.initiator }
                        io.in(gameName + task.target).emit("event", data)
                        var data = { "title": task.target + " reflected the attack back at you with a mirror" }
                        io.in(gameName + task.initiator).emit("event", data)

                        var options = ["Do Nothing"]
                        var mirror = await db.getPlayerMirror(gameName, task.initiator)
                        var shield = await db.getPlayerShield(gameName, task.initiator)
                        if (mirror == null || shield == null) {
                            console.log("[ERROR][18][" + gameName + "] items null")
                            console.log(task.initiator)
                            return
                        }
                        if (mirror > 0) {
                            options.push("Mirror")
                        }
                        if (shield > 0) {
                            options.push("Shield")
                        }

                        var newTask: task = {
                            initiator: task.initiator,
                            responder: task.initiator,
                            type: task.type,
                            mirrored: task.mirrored,
                            shielded: task.shielded,
                            target: task.target,
                            timeout: Date.now() + decisionTime,
                            response: undefined,
                            emitted: false,
                            options: options,
                            title: "How are you going to respond to this?"
                        }
                        queue.unshift(newTask)
                        await db.setGameQueue(gameName, queue)
                    }
                } else {
                    //assume that this is after the first question and target has been selected.
                    task.target = task.response
                    var data = { title: "" }
                    if (task.type == "Steal") {
                        data = { "title": task.initiator + " is trying to rob you!" }
                    }
                    else if (task.type == "Kill") {
                        data = { "title": task.initiator + " is trying to kill you!" }
                    }
                    else if (task.type == "Swap") {
                        data = { "title": task.initiator + " is trying to swap with you!" }
                    }
                    io.in(gameName + task.target).emit("event", data)
                    var options = ["Do Nothing"]
                    var mirror = await db.getPlayerMirror(gameName, task.target)
                    var shield = await db.getPlayerShield(gameName, task.target)
                    if (mirror == null || shield == null) {
                        console.log("[ERROR][19][" + gameName + "] items null")
                        console.log(task.target)
                        return
                    }
                    if (mirror > 0) {
                        options.push("Mirror")
                    }
                    if (shield > 0) {
                        options.push("Shield")
                    }

                    //add task to front of queue
                    var newTask: task = {
                        initiator: task.initiator,
                        responder: task.target,
                        type: task.type,
                        mirrored: task.mirrored,
                        shielded: task.shielded,
                        target: task.target,
                        timeout: Date.now() + decisionTime,
                        response: undefined,
                        emitted: false,
                        title: "How are you going to respond to this?",
                        options: options,

                    }
                    queue.unshift(newTask)
                    db.setGameQueue(gameName, queue)
                }

            } else if (task.timeout < Date.now()) {
                data = { "title": "you didn't answer the question in time" }
                io.in(gameName + task.target).emit("event", data)
                var choice = task.options[Math.floor(Math.random() * task.options.length)]
                task.response = choice;
                queue.unshift(task)
                await db.setGameQueue(gameName, queue)
                setTimeout(function () {
                    //allow clients to move to next page.
                    gameLoop(gameName)
                }, 1000);
                return
            } else {
                //nothing to do, try again in 5 seconse
                //add task back to queue
                queue.unshift(task)
                await db.setGameQueue(gameName, queue)
                setTimeout(function () {
                    gameLoop(gameName)
                }, 5000);
                return
            }
        }
        setTimeout(function () {
            gameLoop(gameName)
        }, 5000);
        return
    }

    const addToQueue = async (gameName: string, element: object) => {
        var queue = await db.getGameQueue(gameName) as object[]
        if (queue == null || queue == undefined) {
            console.log("[ERROR][20][" + gameName + "] items null")
            return
        }
        queue.push(element)

        await db.setGameQueue(gameName, queue)
        return
    }

    const addToTileQueue = async (gameName: string, element: object) => {
        console.log("adding to tile queue")
        var TileQueue = await db.getGameTileQueue(gameName) as object[]

        if (TileQueue == null || TileQueue == undefined) {
            console.log("[ERROR][21][" + gameName + "] items null")
            return
        }
        TileQueue.push(element)

        await db.setGameTileQueue(gameName, TileQueue)
        return
    }

    const addToScoreHistory = async (gameName: string, turnNumber: number, element: object) => {
        var score = await db.getGameScoreHistory(gameName) as object[]
        if (score == null || score == undefined) {
            console.log("[ERROR][22][" + gameName + "] items null")
            return
        }
        score[turnNumber] = element

        await db.setGameScoreHistory(gameName, score)
        return
    }

    var games = await db.getGamelist()
    for (var i in games) {
        var gameState = await db.getGameState(games[i].name)
        if (gameState == 2) {
            gameLoop(games[i].name)
        }
    }
});