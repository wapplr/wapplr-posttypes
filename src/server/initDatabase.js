import wapplrMongo from "wapplr-mongo";

export default async function initDatabase(p = {}) {

    const {wapp, config = {}} = p;

    const {
        mongoConnectionString
    } = config;

    const wappServer = wapp.server;
    if (!wappServer.database){
        wapplrMongo(p);
    }

    return await wappServer.database.getDatabase({mongoConnectionString, addIfThereIsNot: true})

}
