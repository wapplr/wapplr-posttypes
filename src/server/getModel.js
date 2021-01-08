import mongoose from "mongoose";
import initDatabase from "./initDatabase";

function getFields(p = {}) {
    return {}
}

export default async function getModel(p = {}) {

    const {name = "post"} = p;
    const capitalzedName = name.slice(0,1).toUpperCase()+name.slice(1);

    const config = p.config || {};

    const modelName = config.modelName || capitalzedName;
    const addSchemaFields = config.schemaFields || {};
    const setSchemaMiddleware = config.setSchemaMiddleware;

    const database = await initDatabase(p);

    let Model = config.Model || database.getModel({modelName});

    if (Model) {
        if (!database.getModel({modelName})){
            Model = database.addModel({modelName, Model});
        }
        return Model
    }

    const connection = database.connection;
    if (connection.models[modelName]){
        Model = connection.models[modelName];
        Model = database.addModel({modelName, Model})
        return Model;
    }

    const Schema = mongoose.Schema;
    const schemaFields = {...addSchemaFields};
    const modelSchema = new Schema(schemaFields);

    const addToSchemaFields = {
        ...getFields(p)
    };

    Object.keys(addToSchemaFields).forEach(function (key) {
        if (typeof addToSchemaFields[key] == "function" || typeof addToSchemaFields[key].type == "function") {
            if (!modelSchema.paths[key]) {
                schemaFields[key] = addToSchemaFields[key];
            }
        } else if (typeof addToSchemaFields[key] == "object") {
            Object.keys(addToSchemaFields[key]).forEach(function (innerKey) {
                if (!modelSchema.paths[key + "." + innerKey]) {
                    schemaFields[key + "." + innerKey] = addToSchemaFields[key][innerKey];
                }
            })
        }
    });

    modelSchema.add(schemaFields);

    if (setSchemaMiddleware){
        setSchemaMiddleware({schema: modelSchema});
    }

    Model = connection.model(modelName, modelSchema);

    const resolvers = (typeof config.resolvers == "function") ? config.resolvers({modelName, Model}) :
        (typeof config.resolvers == "object") ? {...config.resolvers} :
            {
                [modelName.slice(0,1).toLowerCase() + modelName.slice(1) + "FindById"]: function(TC) {
                    return TC.getResolver("findById")
                }
            }

    Model = database.addModel({modelName, Model, resolvers});

    return Model;

}
