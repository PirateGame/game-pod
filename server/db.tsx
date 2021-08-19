import prisma from '../lib/prisma'

export class dbInteraction {
    async setToken(playerName: string, gameName: string, token: string){
        var update = await prisma.game.update({
            where: {
                name: gameName,
            },
            data: {
                players: {
                    update: {
                        where: {
                            name: playerName
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