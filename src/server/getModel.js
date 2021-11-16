import mongoose from "mongoose";
import {capitalize, defaultDescriptor} from "../common/utils";
import getConstants from "./getConstants";

export default function getModel(p = {}) {

    const defaultConstants = getConstants(p);
    const {name = "post", statusManager, authorModelName = "User", labels = defaultConstants.labels} = p;
    const {authorStatusManager = statusManager} = p;

    const n = name;
    const ns = n+"s";
    const N = capitalize(n);

    const config = p.config || {};

    const modelName = config.modelName || N;
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
            wapplr: {
                readOnly: true,
                formData: { hidden: true },
                listData: {
                    sort: {
                        disabled: true,
                    }
                }
            }
        },
        _createdDate: {
            type: mongoose.Schema.Types.Date,
            index: true,
            wapplr: {
                readOnly: true,
                listData: {
                    sort: {
                        ascLabel: labels[ns+"Sort_CREATEDDATE_ASC"],
                        descLabel: labels[ns+"Sort_CREATEDDATE_DESC"],
                        default: "DESC",
                        order: 0
                    }
                }
            }
        },
        _author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: authorModelName,
            wapplr: { readOnly: true }
        },
        _status: {
            type: Number,
            default: statusManager.getDefaultStatus(),
            index: true,
            wapplr: {
                readOnly: true,
                listData: {
                    sort: {
                        disabled: true,
                    }
                }
            }
        },
        _author_status: {
            type: Number,
            index: true,
            wapplr: {
                readOnly: true,
                listData: {
                    sort: {
                        disabled: true,
                    }
                }
            }
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
                virtual.set(set);
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
            return authorStatusManager.isNotDeleted({
                _id: (this._author?._id) ? this._author?._id : this._author,
                _status: this._author_status
            });
        },
        options: {
            instance: "Boolean"
        }
    });

    modelSchema.add(schemaFields);

    Object.keys(schemaFields).forEach((path)=>{
        const schemaProps = schemaFields[path];
        const ref = schemaProps.ref;
        const array = typeof schemaProps.type === "object" && typeof schemaProps.type.length === "number";
        const findForValidate = schemaProps.wapplr?.findForValidate || {};
        if (ref){
            modelSchema.path(path).validate(async function (value) {
                if (!value){
                    return true;
                }
                const author = this._author;
                Model = database.getModel({modelName: ref});
                if (array){
                    if (typeof value === "object" && typeof value.length === "number"){
                        const responses = await Promise.allSettled(value.map(async (item)=>{
                            if (this._id === value && modelName === ref){
                                return true;
                            }
                            try {
                                const posts = await Model.find({...findForValidate, _id: item, _author: author});
                                return !!(posts?.length);
                            } catch (e) {
                                throw e;
                            }
                        }));
                        return !!(!responses.find((r)=>!r.value || r.status !== "fulfilled"));
                    } else {
                        return false;
                    }
                } else {
                    if (this._id === value && modelName === ref){
                        return true;
                    }
                    try {
                        const posts = await Model.find({...findForValidate, _id: value, _author: author});
                        return !!(posts?.length);
                    } catch (e) {
                        throw e;
                    }
                }
            }, "Invalid value [{VALUE}]")
        }
    });

    if (setSchemaMiddleware){
        setSchemaMiddleware({schema: modelSchema, statusManager});
    }

    Model = connection.model(modelName, modelSchema);

    Model = database.addModel({modelName, Model});

    return Model;

}
