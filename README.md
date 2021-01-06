# Wapplr-posttypes

With this package easier initialize a database collection for [Wapplr](https://github.com/wapplr/wapplr).

```js
//server.js
import wapplrMongo from "wapplr-mongo";
import wapplrServer from "wapplr";
const wapp = wapplrServer({config: {
        server: {
            databaseConfig: {
                mongoConnectionString: "mongodb://localhost/wapplr",
            }
        },
        globals: {
            WAPP: "yourBuildHash",
            ROOT: __dirname
        }
    }
});
await wapplrMongo({wapp});
await wapplrPosttypes({wapp});

const highScore = await wapp.server.posttypes.getPosttype({
    name: "highScore",
    addIfThereIsNot: true,
    config: {
        schemaFields: {
            username: {type: String},
            score: {type: Number, default: 0},
            step: {type: Number, default: 0},
            time: {type: Number, default: 0},
            date: {type: Number, default: 0},
            ip: {type: String, default: "", wapplr: {hidden: true}},
        },
        resolvers: function(p = {}) {
            const {modelName, Model} = p;
            const requestName = modelName.slice(0,1).toLowerCase() + modelName.slice(1);
            return {
                [requestName + "GetBrief"]: {
                    type: "["+modelName+"]",
                    resolve: async function(p = {}) {
                        const {args = {}} = p;
                        const posts = await Model.find().sort({ score: -1, time: 1 });
                        if (!posts || (posts && !posts.length)){
                            return [];
                        }
                        return posts.slice(0,10)
                    }
                },
                [requestName + "CreateOne"]: function(TC) {
                    const defaultCreateOne = TC.getResolver('createOne');
                    return {
                        ...defaultCreateOne,
                        resolve: function (p = {}) {
                            const {args = {}} = p;
                            const {record} = args;
                            if (record) {
                                record.ip = wapp.response.req.remoteAddress;
                            }
                            return defaultCreateOne.resolve(p)
                        }
                    }
                }
            }
        }
    }})

wapp.server.listen();
```

```js
//client.js
/*...*/
const send = wapp.requests.send;
const response = await send({requestName:"highScoreGetBrief"});
const highScores = response.highScoreGetBrief;
```
## License

MIT
