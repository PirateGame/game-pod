require('dotenv').config()
import express, { Express } from 'express';
import * as http from 'http';
import next, { NextApiHandler } from 'next';
import * as socketio from 'socket.io';
import { dbInteraction } from "./db";
var jwt=require('jsonwebtoken');

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
            if (await db.setToken(gameName, playerName, token) == false){
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
            if ( token == await db.getToken(gameName, playerName)) {
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

        socket.on("getPlayerList", async (playerName, gameName, callback: any) => {
            var playerList = await db.getPlayerlist(gameName)
            console.log("[INFO][" + gameName + "][" + playerName + "] get player list ")
            callback({
                status: "ok",
                playerList: playerList
            })
        })

        socket.on("submitBoard", async (playerName, gameName, board, callback: any) => {
            await db.setBoard(gameName, playerName, board)
            console.log("[INFO][" + gameName + "][" + playerName + "] set Board ")
            gameReady(gameName)
            callback({
                status: "ok"
            })
        })

        socket.on("setTeam", async (playerName, gameName, ship, captain, callback: any) => {
            await db.setTeam(gameName, playerName, ship, captain)
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

        socket.on("questionResponse", async(playerName, gameName, option) => {
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

    const gameReady = async(gameName: string) => {
        var ready = true
        await db.getPlayerlist(gameName).then(async(playerList) => {
            for (var player = 0;  player < playerList.length; player ++){
                await db.getPlayerBoard(gameName, playerList[player]).then((board) => {
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
        setTimeout(function (){
            //allow clients to move to next page.
            gameLoop(gameName)
        }, 10000);
    }

    const gameLoop = async(gameName: string) => {
        var playerList = await db.getPlayerlist(gameName)
        for (var i = playerList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [playerList[i], playerList[j]] = [playerList[j], playerList[i]];
        }

        var queue = await db.getGameQueue(gameName) as object[]
        console.log("[Info][" + gameName + "] Game loop")

        var decisionTime = await db.getGameDecisionTime(gameName) * 1000

        if (queue.length < 1) {
            var turn = await db.getGameTurn(gameName)
            turn += 1
            await db.setGameTurn(gameName, turn)
            var maxTurns = await db.getGameSizeX(gameName) * await db.getGameSizeY(gameName)
            if (turn > maxTurns + 1) { //need to do the last turn.
                var data = {"title": "Game Over."}
                io.in(gameName).emit("event", data)
                return
            } else {
                //choose new tile.
                var tilesRemaining: number[] = await db.getGameTilesRemaining(gameName)

                if (tilesRemaining == undefined) {
                    console.log("[ERROR]][" + gameName + "] tilesRemaing Not found")
                    return
                }
                var currentTile = tilesRemaining[Math.floor(Math.random() * tilesRemaining.length)]
                console.log("[Info][" + gameName + "] " + currentTile)

                tilesRemaining.splice(tilesRemaining.indexOf(currentTile), 1)

                await db.setGameCurrentTile(gameName, currentTile)
                await db.setGameTilesRemaining(gameName, tilesRemaining)

                await db.setGameTurn(gameName, turn)
                //This doesn't iterate
                for (var i = 0; i < playerList.length; i++) {
                    var board: any = await db.getPlayerBoard(gameName, playerList[i])
                    if (board == null || board == undefined){
                        console.log("[ERROR]][" + gameName + "][" + playerList[i] + "] Board Not found")
                        return
                    }
                    for (var tile = 0; tile < board.length; tile ++) {
                        if (board[tile].id == currentTile) {
                            //from here
                            var money = await db.getPlayerMoney(gameName, playerList[i])
                            var bank = await db.getPlayerBank(gameName, playerList[i])
                            var shield = await db.getPlayerShield(gameName, playerList[i])
                            var mirror = await db.getPlayerMirror(gameName, playerList[i])

                            var enemyList = JSON.parse(JSON.stringify(playerList))

                            enemyList.splice(i,1)

                            if(money == undefined || bank == undefined || shield == undefined || mirror == undefined) {
                                console.log("[ERROR][" + gameName + "][" + playerList[i] + "] Could not find all player data")
                                return
                            }

                            //to here
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
                            } else if (board[tile].content == "200") {
                                money += 200
                                await db.setPlayerMoney(gameName, playerList[i], money)
                                var data = {"title": "You got 200 Gold Coins"}
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content == "A"){
                                //Rob
                                var data = {"title": "You get to rob someone this turn"}
                                io.in(gameName + playerList[i]).emit("event", data)
                                var job: task = {
                                    initiator: playerList[i],
                                    responder: playerList[i],
                                    type: "A",
                                    mirrored: 0,
                                    shielded: false,
                                    target: "",
                                    title: "Who do you want to rob?",
                                    timeout: Date.now() + decisionTime,
                                    response: undefined,
                                    emitted: false,
                                    options: enemyList
                                }

                                addToQueue(gameName, job)
                            } else if (board[tile].content == "B"){
                                //Kill
                                var data = {"title": "You get to kill someone this turn"}
                                io.in(gameName + playerList[i]).emit("event", data)
                                var job: task = {
                                    initiator: playerList[i],
                                    responder: playerList[i],
                                    type: "B",
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
                            } else if (board[tile].content == "C"){
                                //Present
                                var data = {"title": "You get to give a present someone this turn"}
                                io.in(gameName + playerList[i]).emit("event", data)
                                var job: task = {
                                    initiator: playerList[i],
                                    responder: playerList[i],
                                    type: "C",
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
                            } else if (board[tile].content == "D"){
                                //Skull and Crossbones
                                var data = {"title": "Skull and cross bones not implemented"}
                                io.in(gameName + playerList[i]).emit("event", data)
                                // addToQueue(gameName, {
                                //     playerName: playerList[i],
                                //     type: "D",
                                //     mirrored: 0,
                                //     shielded: false,
                                //     target: "",
                                //     title: "which team do you want to kill?",
                                //     timeout: Date.now() + decisionTime,
                                //     response: null,
                                //     emitted: false,
                                //     options: ["1", "2", "3", "A", "B", "C"]
                                // })
                            } else if (board[tile].content == "E"){
                                //Swap
                                var data = {"title": "You get to swap with someone this turn"}
                                io.in(gameName + playerList[i]).emit("event", data)
                                var job: task = {
                                    initiator: playerList[i],
                                    responder: playerList[i],
                                    type: "E",
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
                            } else if (board[tile].content == "F"){
                                //Choose next tile
                                var data = {"title": "You get to choose the next tile"}
                                io.in(gameName + playerList[i]).emit("event", data)
                                
                                var job: task = {
                                    initiator: playerList[i],
                                    responder: playerList[i],
                                    type: "F",
                                    title: "Which tile do you want next?",
                                    timeout: Date.now() + decisionTime,
                                    response: undefined,
                                    emitted: false,
                                    options: tilesRemaining.map(String),
                                    target: "false",
                                    mirrored: 0,
                                    shielded: false,
                                }
                                addToQueue(gameName, job)
                            } else if (board[tile].content == "G"){
                                //Shield
                                shield += 1
                                await db.setPlayerShield(gameName, playerList[i], shield)
                                var data = {"title": "You got a Shield"}
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content == "H"){
                                //Mirror
                                mirror += 1
                                await db.setPlayerMirror(gameName, playerList[i], mirror)
                                var data = {"title": "You got a mirror"}
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content == "I"){
                                //Bomb
                                money = 0
                                await db.setPlayerMoney(gameName, playerList[i], money)
                                var data = {"title": "You got Bombed! You lost all your stash"}
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content == "J"){
                                //Double
                                money = money * 2
                                await db.setPlayerMoney(gameName, playerList[i], money)
                                var data = {"title": "You Doubled your stash"}
                                io.in(gameName + playerList[i]).emit("event", data)
                            } else if (board[tile].content == "K"){
                                //Bank
                                bank += money
                                money = 0
                                await db.setPlayerMoney(gameName, playerList[i], money)
                                await db.setPlayerBank(gameName, playerList[i], bank)
                                var data = {"title": "Your stash has been saved to the bank."}
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
            if(task.timeout == null || task.options == null || task.mirrored == null || task.initiator == null || task.target == null) {
                console.log("task did not have all data")
                return
            }
            if (task.emitted == false) {
                console.log("emitting question")
                io.in(gameName + task.responder).emit("question",task.title, task.options)
                task.emitted = true
                
                task.timeout = Date.now() + decisionTime

                queue.unshift(task)
                await db.setGameQueue(gameName, queue)
                
            } else if (task.response != null){
                //we have an answer.
                if (task.type == "C") {
                    //Present
                    var money = await db.getPlayerMoney(gameName, task.response)
                    if(money == null) {
                        return
                    }
                    money += 1000
                    await db.setPlayerMoney(gameName, task.response, money)
                    var data = {"title": "You gave a present to " + task.response}
                    io.in(gameName + task.initiator).emit("event", data)
                    var data = {"title": "You got a present from " + task.initiator}
                    io.in(gameName + task.response).emit("event", data)

                } else if (task.type == "F") {
                    //next tile
                    //add next tile to list.

                } else if (task.response == "Do Nothing") {
                    //this means we can perform the action.
                    if (task.mirrored % 2 == 0) {
                        //mirrored even number of times, so performed on target
                        if (task.type == "A") {
                            //rob
                            var ownerMoney = await db.getPlayerMoney(gameName, task.initiator)
                            var targetMoney = await db.getPlayerMoney(gameName, task.target)
                            if (targetMoney == null || ownerMoney == null) {
                                return
                            }
                            ownerMoney += targetMoney
                            targetMoney = 0
                            await db.setPlayerMoney(gameName, task.initiator, ownerMoney)
                            await db.setPlayerMoney(gameName, task.target, targetMoney)
                        } else if (task.type == "B") {
                            //kill
                            await db.setPlayerMoney(gameName, task.target, 0)
                        } else if (task.type == "D") {
                            //scull and crossbones
                            return
                        } else if (task.type == "E") {
                            //swap
                            var ownerMoney = await db.getPlayerMoney(gameName, task.initiator)
                            var targetMoney = await db.getPlayerMoney(gameName, task.target)
                            if (targetMoney == null || ownerMoney == null) {
                                return
                            }
                            var middle: number = targetMoney
                            targetMoney = ownerMoney
                            ownerMoney = middle
                            await db.setPlayerMoney(gameName, task.initiator, ownerMoney)
                            await db.setPlayerMoney(gameName, task.target, targetMoney)
                        }
                    } else {
                        //mirrored odd number of times, so performed on owner
                        if (task.type == "A") {
                            //rob
                            var ownerMoney = await db.getPlayerMoney(gameName, task.initiator)
                            var targetMoney = await db.getPlayerMoney(gameName, task.target)
                            if (targetMoney == null || ownerMoney == null) {
                                return
                            }
                            targetMoney += ownerMoney
                            ownerMoney = 0
                            await db.setPlayerMoney(gameName, task.initiator, ownerMoney)
                            await db.setPlayerMoney(gameName, task.target, targetMoney)
                        } else if (task.type == "B") {
                            //kill
                            await db.setPlayerMoney(gameName, task.initiator, 0)
                        } else if (task.type == "D") {
                            //scull and crossbones
                            return
                        } else if (task.type == "E") {
                            //swap
                            var ownerMoney = await db.getPlayerMoney(gameName, task.initiator)
                            var targetMoney = await db.getPlayerMoney(gameName, task.target)
                            if (targetMoney == null || ownerMoney == null) {
                                return
                            }
                            var middle: number = targetMoney
                            targetMoney = ownerMoney
                            ownerMoney = middle
                            await db.setPlayerMoney(gameName, task.initiator, ownerMoney)
                            await db.setPlayerMoney(gameName, task.target, targetMoney)
                        }
                    }
                } else if (task.response == "Shield") {
                    //action blocked.

                    if (task.mirrored % 2 == 0) {
                        var shield = await db.getPlayerShield(gameName, task.initiator)
                        if (shield == null) {
                            return
                        }
                        shield -= 1
                        db.setPlayerShield(gameName, task.initiator, shield)

                        var data = {"title": "You used a shield to block " + task.initiator}
                        io.in(gameName + task.target).emit("event", data)
                        var data = {"title": task.target + " blocked the attack with a shield"}
                        io.in(gameName + task.initiator).emit("event", data)


                    } else {
                        var shield = await db.getPlayerShield(gameName, task.target)
                        if (shield == null) {
                            return
                        }
                        shield -= 1
                        db.setPlayerShield(gameName, task.target, shield)

                        var data = {"title": "You used a shield to block " + task.target}
                        io.in(gameName + task.initiator).emit("event", data)
                        var data = {"title": task.initiator + " blocked the attack with a shield"}
                        io.in(gameName + task.target).emit("event", data)


                    }
                } else if (task.response == "Mirror") {
                    task.mirrored += 1

                    if (task.mirrored % 2 == 0) {
                        var mirror = await db.getPlayerMirror(gameName, task.initiator)
                        if (mirror == null) {
                            return
                        }
                        mirror -= 1
                        db.setPlayerMirror(gameName, task.initiator, mirror)

                        var data = {"title": "You used a mirror to reflect " + task.target}
                        io.in(gameName + task.initiator).emit("event", data)
                        var data = {"title": task.initiator + " reflected the attack back at you with a mirror"}
                        io.in(gameName + task.target).emit("event", data)

                        var options = ["Do Nothing"]
                        var mirror = await db.getPlayerMirror(gameName, task.target)
                        var shield = await db.getPlayerShield(gameName, task.target)
                        if (mirror == null || shield == null) {
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
                            return
                        }
                        mirror -= 1
                        db.setPlayerMirror(gameName, task.target, mirror)

                        var data = {"title": "You used a mirror to reflect " + task.initiator}
                        io.in(gameName + task.target).emit("event", data)
                        var data = {"title": task.target + " reflected the attack back at you with a mirror"}
                        io.in(gameName + task.initiator).emit("event", data)

                        var options = ["Do Nothing"]
                        var mirror = await db.getPlayerMirror(gameName, task.initiator)
                        var shield = await db.getPlayerShield(gameName, task.initiator)
                        if (mirror == null || shield == null) {
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
                    var data = {title: ""}
                    if(task.type == "A") {
                        data = {"title": task.initiator + " is trying to rob you!"}
                    }
                    if(task.type == "B") {
                        data = {"title": task.initiator + " is trying to kill you!"}
                    }
                    if(task.type == "E") {
                        data = {"title": task.initiator + " is trying to swap with you!"}
                    }
                    
                    io.in(gameName + task.target).emit("event", data)
                    var options = ["Do Nothing"]
                    var mirror = await db.getPlayerMirror(gameName, task.target)
                    var shield = await db.getPlayerShield(gameName, task.target)
                    if (mirror == null || shield == null) {
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

            } else if(task.timeout < Date.now()) {
                data = {"title": "you didn't answer the question in time"}
                io.in(gameName + task.target).emit("event", data)
                var choice = task.options[Math.floor(Math.random() * task.options.length)]
                task.response = choice;
                queue.unshift(task)
                await db.setGameQueue(gameName, queue)
                setTimeout(function (){
                    //allow clients to move to next page.
                    gameLoop(gameName)
                }, 1000);
                return
            } else {
                //nothing to do, try again in 5 seconse
                //add task back to queue
                queue.unshift(task)
                await db.setGameQueue(gameName, queue)
                setTimeout(function (){
                    gameLoop(gameName)
                }, 5000);
                return
            }
        }
        setTimeout(function (){
            gameLoop(gameName)
        }, 5000);
    }

    const addToQueue = async (gameName: string, element: object) => {
        var queue = await db.getGameQueue(gameName) as object[]
        if (queue == null || queue == undefined) {
            return
        }
        queue.push(element)

        await db.setGameQueue(gameName, queue)
        return
    }

    var games = await db.getGamelist()
    for (var i in games) {
        gameLoop(games[i].name)
    }
});