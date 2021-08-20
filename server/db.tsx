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
}