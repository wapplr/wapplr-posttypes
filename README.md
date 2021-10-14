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

const titlePattern = /^.{1,250}$/;
const contentPattern = /^.{1,2500}$/;
const contentBriefPattern = /^.{1,500}$/;

const post = await wapp.server.postTypes.getPostType({
    name: "post",
    addIfThereIsNot: true,
    config: {

        mongoConnectionString: "mongodb://localhost/wapplr",
        
        modelName: "Post",
        schemaFields: {
            title: {
                type: String,
                wapplr: {
                    pattern: titlePattern,
                    required: true
                }
            },
            subtitle: {
                type: String,
                wapplr: {
                    pattern: titlePattern,
                }
            },
            content: {
                type: String,
                wapplr: {
                    pattern: contentPattern,
                    required: true
                }
            },
            contentBrief: {
                type: String,
                wapplr: {
                    pattern: contentBriefPattern,
                }
            },
        },
        setSchemaMiddleware: function({schema}){},
        
        statuses: {
            featured: 120,
            approved: 100,
            requiredData: 50,
            created: 40,
            deleted: 30,
            banned: 20
        },
        statusField: "_status",
        requiredDataForStatus: {
            title: { type: String },
            content: { type: String },
        },
        
        messages: {
            savePostDefaultFail: "Sorry, there was an issue save the entry, please try again",
            invalidData: "Invalid data",
            missingData: "Missing data",
            lowStatusLevel: "Your status level is too low to perform the operation",
            postNotFound: "Post not found",
            accessDenied: "You do not have permission to perform that operation"
        },

        resolvers: {
            getAll: function ({Model}) {
                return {
                    extendResolver: "findMany",
                    args: null,
                    resolve: async function({input}) {
                        return await Model.find();
                    }
                }
            },
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
