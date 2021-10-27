//This should be .jsx for server and .tsx for dev env
import prisma from '../lib/prisma'

export class dbInteraction {
    async getPlayerID(gameName: string, playerName: string) {
        var id = await prisma.player.findFirst({
            where: {
                name: playerName,
                gameName: gameName
            },
            select: {
                id: true
            }
        })
        return id
    }

    async getPlayerBoard(gameName: string, playerName: string) {
        var board = await prisma.player.findMany({
            where: {
                name: playerName,
                gameName: gameName
            },
            select: {
                board: true
            }
        })
        if (board == null || board == undefined) {
            return
        }
        return board[0].board
    }

    async setToken(gameName: string, playerName: string, token: string){
        var playerID = await this.getPlayerID(gameName, playerName)
        if (playerID == null) {
            return false
        }
        var update = await prisma.player.updateMany({
            where: {
                gameName: gameName,
                name: playerName
            },
            data: {
                token: token
            }
        })
        return update
    }

    async setBoard(gameName: string, playerName: string, board: any){
        var update = await prisma.player.updateMany({
            where: {
                gameName: gameName,
                name: playerName
            },
            data: {
                board: board
            }
        })
        return update
    }

    async setTeam(gameName: string, playerName: string, ship: number, captain: number){
        var update = await prisma.player.updateMany({
            where: {
                gameName: gameName,
                name: playerName
            },
            data: {
                ship: ship,
                captain: captain,
            }
        })
        return update
    }

    async getToken(gameName: string, playerName: string){
        var token = await prisma.player.findFirst({
            where: {
                gameName: gameName,
                name: playerName
            },
            select: {
                token: true
            }
        })
        if (!token){
            return false
        }
        return token.token
    }

    async getPlayerlist(gameName: string) {
        var result = await prisma.player.findMany({
            where: {
                gameName: gameName,
            },
            select: {
                name: true,
            }
        })
        var out = []
        for(var i=0; i < result.length; i ++) {
            out.push(result[i].name)
        }
        return out
    }

    async getGamelist() {
        var result = await prisma.game.findMany({
            select: {
                name: true,
            }
        })
        return result
    }

    async setGameState(gameName: string, state: number){
        var update = await prisma.game.updateMany({
            where: {
                name: gameName,
            },
            data: {
                state: state,
            }
        })
        return update
    }

    async setGameTurnNumber(gameName: string, turn: number){
        var update = await prisma.game.updateMany({
            where: {
                name: gameName,
            },
            data: {
                turnNumber: turn,
            }
        })
        return update
    }

    async getGameSizeX(gameName: string) {
        var result = await prisma.game.findMany({
            where: {
                name: gameName,
            },
            select: {
                sizeX: true,
            }
        })
        return result[0].sizeX
    }
    
    async getGameSizeY(gameName: string) {
        var result = await prisma.game.findMany({
            where: {
                name: gameName,
            },
            select: {
                sizeY: true,
            }
        })
        return result[0].sizeY
    }

    async getGameQueue(gameName: string) {
        var result = await prisma.game.findMany({
            where: {
                name: gameName,
            },
            select: {
                queue: true,
            }
        })
        return result[0].queue
    }

    async setGameQueue(gameName: string, queue: object){
        var update = await prisma.game.updateMany({
            where: {
                name: gameName,
            },
            data: {
                queue: queue,
            }
        })
        return update
    }

    async getGameTurn(gameName: string) {
        var result = await prisma.game.findMany({
            where: {
                name: gameName,
            },
            select: {
                turnNumber: true,
            }
        })
        return result[0].turnNumber
    }

    async getGameDecisionTime(gameName: string) {
        var result = await prisma.game.findMany({
            where: {
                name: gameName,
            },
            select: {
                decisionTime: true,
            }
        })
        return result[0].decisionTime
    }

    async setGameTurn(gameName: string, turn: number) {
        var result = await prisma.game.updateMany({
            where: {
                name: gameName,
            },
            data: {
                turnNumber: turn,
            }
        })
        return result
    }

    async setGameCurrentTile(gameName: string, tile: number) {
        var result = await prisma.game.updateMany({
            where: {
                name: gameName,
            },
            data: {
                currentTile: tile,
            }
        })
        return result
    }

    async setGameTilesRemaining(gameName: string, tiles: object) {
        var result = await prisma.game.updateMany({
            where: {
                name: gameName,
            },
            data: {
                tilesRemaining: tiles,
            }
        })
        return result
    }

    async getGameTilesRemaining(gameName: string) {
        var res: any = await prisma.game.findFirst({
            where: {
                name: gameName,
            },
            select: {
                tilesRemaining: true,
            }
        })
        return res.tilesRemaining
    }

    async getGameState(gameName: string) {
        var res: any = await prisma.game.findFirst({
            where: {
                name: gameName,
            },
            select: {
                state: true,
            }
        })
        return res.state
    }

    async getPlayerMoney(gameName: string, playerName: string) {
        var res = await prisma.player.findFirst({
            where: {
                name: playerName,
                gameName: gameName
            },
            select: {
                money: true
            }
        })
        if (res == null) {
            return
        }
        return res.money
    }

    async setPlayerMoney(gameName: string, playerName: string, money: any){
        var update = await prisma.player.updateMany({
            where: {
                gameName: gameName,
                name: playerName
            },
            data: {
                money: money
            }
        })
        return update
    }

    async getPlayerBank(gameName: string, playerName: string) {
        var res = await prisma.player.findFirst({
            where: {
                name: playerName,
                gameName: gameName
            },
            select: {
                bank: true
            }
        })
        if (res == null) {
            return
        }
        return res.bank
    }

    async setPlayerBank(gameName: string, playerName: string, bank: any){
        var update = await prisma.player.updateMany({
            where: {
                gameName: gameName,
                name: playerName
            },
            data: {
                bank: bank
            }
        })
        return update
    }

    async getPlayerMirror(gameName: string, playerName: string) {
        var res = await prisma.player.findFirst({
            where: {
                name: playerName,
                gameName: gameName
            },
            select: {
                mirror: true
            }
        })
        if (res == null) {
            return
        }
        return res.mirror
    }

    async setPlayerMirror(gameName: string, playerName: string, mirror: any){
        var update = await prisma.player.updateMany({
            where: {
                gameName: gameName,
                name: playerName
            },
            data: {
                mirror: mirror
            }
        })
        return update
    }

    async getPlayerShield(gameName: string, playerName: string) {
        var res = await prisma.player.findFirst({
            where: {
                name: playerName,
                gameName: gameName
            },
            select: {
                shield: true
            }
        })
        if (res == null) {
            return
        }
        return res.shield
    }

    async setPlayerShield(gameName: string, playerName: string, shield: any){
        var update = await prisma.player.updateMany({
            where: {
                gameName: gameName,
                name: playerName
            },
            data: {
                shield: shield
            }
        })
        return update
    }
}