export default async function initDatabase(p = {}) {
    const {wapp, name = "Model"} = p;
    const server = wapp.server;

    const globalDatabaseConfig = (server.settings && server.settings.databaseConfig) ? server.settings.databaseConfig : {};
    const globalDatabaseConfigForPosttype = globalDatabaseConfig[name] || {};
    const config = (p.config) ? {...globalDatabaseConfigForPosttype, ...p.config} : {...globalDatabaseConfigForPosttype};

    const {
        mongoConnectionString = globalDatabaseConfig.mongoConnectionString || "mongodb://localhost/wapplr",
    } = config;

    const wappServer = wapp.server;

    return await wappServer.database.getDatabase({mongoConnectionString, addIfThereIsNot: true})

}
