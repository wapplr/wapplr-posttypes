import mongoose from "mongoose";
import {capitalize, defaultDescriptor} from "../common/utils";
import getConstants from "./getConstants";

export default function getModel(p = {}) {

    const {name = "post", config = {}} = p;

    const n = name;
    const ns = n+"s";
    const N = capitalize(n);

    const defaultConstants = getConstants(p);
    const {
        statusManager,
        authorModelName = "User",
        labels = defaultConstants.labels,
        modelName = N,
        setSchemaMiddleware,
        database,
        beforeCreateSchema
    } = config;

    const addSchemaFields = config.schemaFields;

    const {authorStatusManager = statusManager} = config;

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
                required: true,
                readOnly: true,
                listData: {
                    sort: {
                        ascLabel: labels[ns+"Sort_CREATEDDATE_ASC"],
                        descLabel: labels[ns+"Sort_CREATEDDATE_DESC"],
                        default: "DESC",
                        order: 0
                    },
                    list: {
                        show: false
                    },
                    table: {
                        componentName: "Date",
                        role: "isAuthorOrAdmin",
                        label: labels[n+"CreatedDateLabel"],
                        icon: "date",
                        order: 99,
                    }
                }
            }
        },
        _author: {
            type: mongoose.Schema.Types.ObjectId,
            wapplr: {
                ref: authorModelName,
                required: true,
                readOnly: true,
                listData: {
                    list: {
                        show: "header"
                    }
                }
            }
        },
        _status: {
            type: Number,
            index: true,
            wapplr: {
                default: statusManager.getDefaultStatus(),
                required: true,
                readOnly: true,
                listData: {
                    sort: {
                        disabled: true,
                    },
                    list: {
                        show: false,
                    },
                    table: {
                        componentName: "Status",
                        role: "isAuthorOrAdmin",
                        label: labels[n+"StatusLabel"],
                        icon: "status",
                        order: 100,
                    }
                }
            }
        },
        _author_status: {
            type: Number,
            index: true,
            wapplr: {
                required: true,
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

    if (beforeCreateSchema){
        beforeCreateSchema({schemaFields})
    }

    function rec(schemaFields) {
        Object.keys(schemaFields).forEach((key)=>{
            const field = schemaFields[key];

            if (!field.type && Object.keys(field).length && key !== "wapplr"){
                rec(field);
            } else {
                ["default", "required", "unique", "ref", "validate"].forEach((saveKey)=> {
                    if (typeof field[saveKey] === "undefined" && field.wapplr && typeof field.wapplr[saveKey] !== "undefined"){
                        field[saveKey] = field.wapplr[saveKey];
                        if (saveKey === "validate" && typeof field.wapplr[saveKey] === "function" && field.wapplr.validationMessage){
                            field[saveKey] = [field.wapplr[saveKey], field.wapplr.validationMessage]
                        }
                    }
                    if (typeof field[saveKey] !== "undefined" && field.wapplr && typeof field.wapplr[saveKey] == "undefined"){
                        field.wapplr[saveKey] = field[saveKey];
                        if (saveKey === "required"){
                            field.wapplr[saveKey] = !!(field[saveKey]);
                        }
                    }
                })
            }

        });
    }

    rec(schemaFields);

    const modelSchema = new Schema(schemaFields, {
        toObject: { virtuals: true },
        toJSON: { virtuals: true },
        id: false
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
                virtual.wapplr = {};
            }
            virtual.wapplr.readOnly = true;
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
        const ref = schemaProps.wapplr?.ref || schemaProps.ref;
        const array = typeof schemaProps.type === "object" && typeof schemaProps.type.length === "number";
        const findForValidate = schemaProps.wapplr?.findForValidate || {};
        const disableFindByAuthor = schemaProps.wapplr?.disableFindByAuthor || false;

        if (ref){
            modelSchema.path(path).validate(async function (value) {
                if (!value){
                    return true;
                }
                const isModified = this.isModified(path);
                if (!isModified){
                    return true;
                }

                const author = this._author;
                Model = database.getModel({modelName: ref});

                const defaultFindProps = {
                    ...findForValidate,
                    ...(!disableFindByAuthor) ? {_author: author} : {}
                };

                if (array){
                    if (typeof value === "object" && typeof value.length === "number"){
                        const responses = await Promise.allSettled(value.map(async (item)=>{
                            if (this._id === value && modelName === ref){
                                return true;
                            }
                            try {
                                const posts = await Model.find({...defaultFindProps, _id: item});
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
                        const posts = await Model.find({...defaultFindProps, _id: value});
                        return !!(posts?.length);
                    } catch (e) {
                        throw e;
                    }
                }
            }, "Invalid value [{VALUE}]")
        }
    });

    modelSchema.pre("save", async function(next) {
        if (modelSchema.tree) {
            Object.keys(modelSchema.tree).forEach((path) => {
                if (typeof this[path] !== "undefined" && this.isModified(path) && this[path]?.length && Array.isArray(this[path])) {
                    const notSortable = !(modelSchema.tree[path].wapplr?.multiple && modelSchema.tree[path].wapplr?.sortable);
                    if (notSortable) {
                        this[path] = this[path].sort();
                    }
                }
            })
        }
        next();
    });

    if (setSchemaMiddleware){
        setSchemaMiddleware({schema: modelSchema, statusManager});
    }

    Model = connection.model(modelName, modelSchema);

    Model = database.addModel({modelName, Model});

    return Model;

}
