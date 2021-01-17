import mongoose from "mongoose";

export default function getModel(p = {}) {

    const {name = "post", statusManager} = p;
    const capitalzedName = name.slice(0,1).toUpperCase()+name.slice(1);

    const config = p.config || {};

    const modelName = config.modelName || capitalzedName;
    const addSchemaFields = config.schemaFields || {};
    const setSchemaMiddleware = config.setSchemaMiddleware;

    const database = p.database;

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

    const schemaFields = {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            wapplr: { readOnly: true }
        },
        _createdDate: {
            type: mongoose.Schema.Types.Date,
            wapplr: { readOnly: true }
        },
        _author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            wapplr: { readOnly: true }
        },
        [statusManager.statusField]: {
            type: Number,
            default: statusManager.getDefaultStatus(),
            wapplr: { readOnly: true }
        },
        ...addSchemaFields
    };

    const modelSchema = new Schema(schemaFields);

    modelSchema.add(schemaFields);

    if (setSchemaMiddleware){
        setSchemaMiddleware({schema: modelSchema});
    }

    Model = connection.model(modelName, modelSchema);

    Model = database.addModel({modelName, Model});

    return Model;

}
