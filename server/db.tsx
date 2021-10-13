import prisma from '../lib/prisma'

export class dbInteraction {
    async getPlayerID(playerName: string, gameName: string) {
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

    async getPlayerBoard(playerName: string, gameName: string) {
        var board = await prisma.player.findFirst({
            where: {
                name: playerName,
                gameName: gameName
            },
            select: {
                board: true
            }
        })
        return board
    }

    async setToken(playerName: string, gameName: string, token: string){
        var playerID = await this.getPlayerID(playerName, gameName)
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

    async setBoard(playerName: string, gameName: string, board: any){
        var playerID = await this.getPlayerID(playerName, gameName)
        if (playerID == null) {
            return false
        }
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

    async setTeam(playerName: string, gameName: string, ship: number, captain: number){
        var playerID = await this.getPlayerID(playerName, gameName)
        if (playerID == null) {
            return false
        }
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

    async getToken(playerName: string, gameName: string){
        var playerID = await this.getPlayerID(playerName, gameName)
        if (playerID == null) {
            return false
        }
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
        return result
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
}