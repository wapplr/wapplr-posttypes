# Wapplr-posttypes

With this package easier initialize a database collection for [Wapplr](https://github.com/wapplr/wapplr).

```js
//server.js
import wapplrPostTypes from "wapplr-posttypes";
import wapplrServer from "wapplr";
const wapp = wapplrServer({config: {
        server: {
            database: {
                mongoConnectionString: "mongodb://localhost/wapplr",
            }
        },
        globals: {
            WAPP: "yourBuildHash",
            ROOT: __dirname
        }
    }
});

wapplrPostTypes({wapp});

const post = await wapp.server.postTypes.getPostType({
    name: "post",
    addIfThereIsNot: true,
    config: {
        schemaFields: {
            title: {type: String},
            content: {type: String},
        },
        resolvers: function(p = {}) {
            const {modelName, Model} = p;
            const requestName = modelName.slice(0,1).toLowerCase() + modelName.slice(1);
            return {
                [requestName + "GetAll"]: {
                    type: "["+modelName+"]",
                    resolve: async function(p = {}) {
                        // eslint-disable-next-line no-unused-vars
                        const {args = {}} = p;
                        const posts = await Model.find().sort({ score: -1, time: 1 });
                        if (!posts || (posts && !posts.length)){
                            return [];
                        }
                        return posts;
                    }
                },
            }
        }
    }
})

wapp.server.listen();
```

```js
//client.js
/*...*/
const send = wapp.requests.send;
const response = await send({requestName:"postGetAll"});
const posts = response.postGetAll;
```
## License

MIT
