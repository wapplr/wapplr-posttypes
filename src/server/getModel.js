import mongoose from "mongoose";
import {defaultDescriptor} from "../common/utils";

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
        Model = database.addModel({modelName, Model});
        return Model;
    }

    const Schema = mongoose.Schema;

    const schemaFields = {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            wapplr: { readOnly: true, formData: { hidden: true } }
        },
        _createdDate: {
            type: mongoose.Schema.Types.Date,
            index: true,
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
            index: true,
            wapplr: { readOnly: true }
        },
        [statusManager.authorStatusField]: {
            type: Number,
            index: true,
            wapplr: { readOnly: true }
        },
        ...addSchemaFields
    };

    const modelSchema = new Schema(schemaFields, {
        toObject: { virtuals: true },
        toJSON: { virtuals: true }
    });

    Object.defineProperty(modelSchema, "virtualToGraphQl", {
        ...defaultDescriptor,
        enumerable: false,
        value: function _virtual({name, get, set, options = {}}) {
            const virtual = modelSchema.virtual(name);
            if (get){
                virtual.get(get);
            }
            if (set){
                virtual.get(set);
            }
            Object.keys(options).forEach(function (key) {
                if (typeof virtual[key] == "undefined") {
                    virtual[key] = options[key];
                }
            });
            if (!virtual.path) {
                virtual.path = name;
            }
            if (!virtual.instance) {
                virtual.instance = "String";
            }
            if (!virtual.wapplr) {
                virtual.wapplr = {
                    readOnly: true
                };
            }
        }
    });

    modelSchema.virtualToGraphQl({
        name: statusManager._status_isFeatured,
        get: function () {
            return statusManager.isFeatured(this);
        },
        options: {
            instance: "Boolean"
        }
    });

    modelSchema.virtualToGraphQl({
        name: statusManager._status_isApproved,
        get: function () {
            return statusManager.isApproved(this);
        },
        options: {
            instance: "Boolean"
        }
    });


    modelSchema.virtualToGraphQl({
        name: statusManager._status_isDeleted,
        get: function () {
            return statusManager.isDeleted(this);
        },
        options: {
            instance: "Boolean"
        }
    });

    modelSchema.virtualToGraphQl({
        name: statusManager._status_isNotDeleted,
        get: function () {
            return statusManager.isNotDeleted(this);
        },
        options: {
            instance: "Boolean"
        }
    });

    modelSchema.virtualToGraphQl({
        name: statusManager._status_isBanned,
        get: function () {
            return statusManager.isBanned(this);
        },
        options: {
            instance: "Boolean"
        }
    });

    modelSchema.virtualToGraphQl({
        name: statusManager._status_isValidated,
        get: function () {
            return statusManager.isValidated(this);
        },
        options: {
            instance: "Boolean"
        }
    });

    modelSchema.virtualToGraphQl({
        name: statusManager._author_status_isNotDeleted,
        get: function () {
            return statusManager.isNotDeleted({
                _id: (this._author?._id) ? this._author?._id : this._author,
                [statusManager.statusField]: this[statusManager.authorStatusField]
            });
        },
        options: {
            instance: "Boolean"
        }
    });

    modelSchema.add(schemaFields);

    if (setSchemaMiddleware){
        setSchemaMiddleware({schema: modelSchema, statusManager});
    }

    Model = connection.model(modelName, modelSchema);

    Model = database.addModel({modelName, Model});

    return Model;

}
