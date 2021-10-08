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

    async setToken(playerName: string, gameName: string, token: string){
        var playerID = await this.getPlayerID(playerName, gameName)
        if (playerID == null) {
            return false
        }
        var update = await prisma.game.update({
            where: {
                name: gameName,
            },
            data: {
                players: {
                    update: {
                        where: {
                            id: playerID.id
                        },
                        data: {
                            token: token
                        }
                    }
                }
            }
        })
        return update
    }

    async setTeam(playerName: string, gameName: string, ship: number, captain: number){
        var playerID = await this.getPlayerID(playerName, gameName)
        if (playerID == null) {
            return false
        }
        var update = await prisma.game.update({
            where: {
                name: gameName,
            },
            data: {
                players: {
                    update: {
                        where: {
                            id: playerID.id
                        },
                        data: {
                            ship: ship,
                            captain: captain
                        }
                    }
                }
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
}