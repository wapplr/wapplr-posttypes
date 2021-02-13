import defaultMessages from "./defaultMessages";
import mongoose from "mongoose";
import wapplrGraphql from "wapplr-graphql";
import { GraphQLError } from "graphql-compose/lib/graphql";

export function getHelpersForResolvers({wapp, Model, statusManager, messages = defaultMessages}) {

    const jsonSchema = Model.getJsonSchema();


    function filterInputRecord(record, parentKey, schema = jsonSchema) {

        const filteredRecord = {};
        let allRequiredFieldsAreProvided = !!(record);
        const missingFields = [];
        let allFieldsAreValid = true;
        const invalidFields = [];

        if (schema.type === "object" && schema.properties && record){
            Object.keys(schema.properties).forEach(function (key) {

                const innerSchema = schema.properties[key];
                const value = record[key];
                const readOnly = !!(innerSchema.wapplr && innerSchema.wapplr.readOnly);
                const disabled = !!(innerSchema.wapplr && innerSchema.wapplr.disabled);
                const required = !!(innerSchema.wapplr && innerSchema.wapplr.required);
                const pattern = (innerSchema.wapplr && innerSchema.wapplr.pattern) ? innerSchema.wapplr.pattern : null;
                const validationMessage = (innerSchema.wapplr && typeof innerSchema.wapplr.validationMessage == "string") ? innerSchema.wapplr.validationMessage : "";

                const nextKey = (parentKey) ? parentKey + "." + key : key;

                if (!readOnly && !disabled) {
                    if (innerSchema.type === "object" && innerSchema.properties) {
                        if (value && typeof value == "object") {
                            const filteredInputResponse = filterInputRecord(value, nextKey, innerSchema);
                            if (filteredInputResponse.record && typeof filteredInputResponse.record == "object") {
                                filteredRecord[key] = filteredInputResponse.record;
                            }
                            if (filteredInputResponse.allRequiredFieldsAreProvided === false){
                                allRequiredFieldsAreProvided = false;
                                missingFields.push(...filteredInputResponse.missingFields)
                            }
                            if (filteredInputResponse.allFieldsAreValid === false){
                                allFieldsAreValid = false;
                                invalidFields.push(...filteredInputResponse.invalidFields)
                            }
                        } else {
                            if (required || JSON.stringify(innerSchema).match(/"required":true/g)){
                                allRequiredFieldsAreProvided = false;
                                missingFields.push({path: "record."+nextKey, message: messages.missingData})
                            }
                        }
                    } else {
                        if ((value !== null && value !== undefined && innerSchema.type && typeof value === innerSchema.type)) {

                            if ((pattern && value.toString().match(pattern)) || !pattern) {
                                filteredRecord[key] = value;
                            } else {

                                allFieldsAreValid = false;
                                invalidFields.push({path: "record."+nextKey, message: validationMessage || messages.invalidData});

                                if (required && !value){
                                    allRequiredFieldsAreProvided = false;
                                    missingFields.push({path: "record."+nextKey, message: messages.missingData});
                                }

                            }

                        } else {
                            if ((pattern && value !== null && value !== undefined && value.toString && !value.toString().match(pattern))) {
                                allFieldsAreValid = false;
                                invalidFields.push({path: "record."+nextKey, message: validationMessage || messages.invalidData});
                            }
                            if (required){
                                allRequiredFieldsAreProvided = false;
                                missingFields.push({path: "record."+nextKey, message: messages.missingData});
                            } else if (value === null) {
                                filteredRecord[key] = value;
                            }
                        }
                    }
                }

            })
        }

        const mergedErrorFields = [...missingFields, ...invalidFields.filter(function (invalidField) {
            return !(missingFields.filter(function (missingField) { return (missingField.path === invalidField.path) }).length)
        })];

        return {
            record: (Object.keys(filteredRecord).length || typeof record == "object") ? filteredRecord : null,
            allRequiredFieldsAreProvided,
            missingFields,
            allFieldsAreValid,
            invalidFields,
            mergedErrorFields
        }
    }

    async function getPost(p) {
        if (p){
            const post = await Model.findOne({...p});
            if (post && post._id){
                return post;
            }
        }
        return null;
    }

    function getFindProps(args = {}) {
        const {_id, email} = args;
        let findProps;

        if (_id){
            if (!findProps){
                findProps = {}
            }
            findProps._id = _id;
        } else if (email){
            if (!findProps){
                findProps = {}
            }
            findProps.email = email;
        }

        return findProps;
    }

    function getFilteredArgs(args = {}, filteredRecord) {

        const filteredArgs = {
            ...args,
        }

        if (filteredRecord){
            filteredArgs.record = filteredRecord;
        }

        return filteredArgs;
    }

    async function getInput(p = {}, inputPost) {

        const {req, res, args = {}} = p;
        const reqUser = req.wappRequest.user;
        const {record} = args;

        const findProps = getFindProps(args);
        const post = inputPost || await getPost(findProps);

        const editor = (reqUser && reqUser._id) ? reqUser : null;
        const author = (post && post._author) ? post._author : null;
        const editorIsAuthor = !!(editor && author && editor._id && editor._id.toString() === author.toString());
        const editorIsAdmin = !!(editor && editor._id && statusManager.isFeatured(editor));
        const editorIsNotDeleted = !!(editor && editor._id && statusManager.isNotDeleted(editor));
        const editorIsValidated = !!(editor && editor._id && statusManager.isValidated(editor));
        const editorIsAuthorOrAdmin = !!(editorIsAuthor || editorIsAdmin);

        const filteredRecordResponse = filterInputRecord(record);
        const filteredRecord = filteredRecordResponse.record;
        const allRequiredFieldsAreProvided = filteredRecordResponse.allRequiredFieldsAreProvided;
        const missingFields = filteredRecordResponse.missingFields;
        const allFieldsAreValid = filteredRecordResponse.allFieldsAreValid;
        const invalidFields = filteredRecordResponse.invalidFields;
        const mergedErrorFields = filteredRecordResponse.mergedErrorFields;

        const filteredArgs = getFilteredArgs(args, filteredRecord);

        return {
            req,
            res,
            wapp,
            args: filteredArgs,
            editor,
            post,
            author,
            editorIsAuthor,
            editorIsAdmin,
            editorIsAuthorOrAdmin,
            editorIsNotDeleted,
            editorIsValidated,
            allRequiredFieldsAreProvided,
            missingFields,
            allFieldsAreValid,
            invalidFields,
            mergedErrorFields
        };

    }


    function filterOutputRecord(record, isAdmin, isAuthorOrAdmin, schema = jsonSchema) {
        const filteredRecord = {};
        if (schema.type === "object" && schema.properties && record){
            Object.keys(schema.properties).forEach(function (key) {

                const innerSchema = schema.properties[key];
                const value = record[key];
                const isPrivateForAdmin = !!(innerSchema.wapplr && innerSchema.wapplr.private === "admin");
                const isPrivateForAuthor = !!(innerSchema.wapplr && innerSchema.wapplr.private === "author");

                if (( !isPrivateForAdmin && !isPrivateForAuthor ) || (isPrivateForAdmin && isAdmin) || (isPrivateForAuthor && isAuthorOrAdmin)) {
                    if (innerSchema.type === "object" && innerSchema.properties) {
                        if (typeof value == "object") {
                            filteredRecord[key] = filterOutputRecord(value, isAdmin, isAuthorOrAdmin, innerSchema)
                        }
                    } else {
                        filteredRecord[key] = value;
                    }
                }
            })
        }

        return (Object.keys(filteredRecord).length || typeof record == "object") ? filteredRecord : null;
    }

    async function getOutput(p = {}) {

        const {req, res, args, response, userBeforeRequest, inputBeforeRequest} = p;

        const sameUser = (
            (userBeforeRequest && userBeforeRequest._id && req.wappRequest.user && req.wappRequest.user._id.toString() === userBeforeRequest._id.toString()) ||
            (!userBeforeRequest && !req.wappRequest.user)
        )

        const {editorIsAdmin, editorIsAuthorOrAdmin} = (sameUser) ? inputBeforeRequest : await getInput({req, res, args});

        let filteredResponse;

        if (response && typeof response == "object" && typeof response.length == "undefined") {

            const responseToObject = (response.toObject) ?
                response.toObject() :
                Object.fromEntries(Object.keys(response).map(function (key) {
                    return [key, (response[key] && response[key].toObject) ? response[key].toObject() : response[key]]
                }))

            filteredResponse = {...responseToObject};

            const {record} = responseToObject;

            if (record){
                filteredResponse.record = filterOutputRecord(record, editorIsAdmin, editorIsAuthorOrAdmin);
            } else if (responseToObject._id){
                filteredResponse = filterOutputRecord(responseToObject, editorIsAdmin, editorIsAuthorOrAdmin);
            }

        } else if (response && typeof response == "object" && typeof response.length == "number") {

            filteredResponse = await Promise.all(response.map(async function (post) {
                post = (post && post.toObject) ? post.toObject() : post;
                if (post && post._id){
                    const {editorIsAdmin, editorIsAuthorOrAdmin} = (sameUser) ? inputBeforeRequest : await getInput({req, res, args}, post);
                    return filterOutputRecord(post, editorIsAdmin, editorIsAuthorOrAdmin)
                }
                return post;
            }))

        }

        return filteredResponse;

    }

    function composeValidationError(p, response) {

        if (response && response.error && response.error.errors){

            const error = {
                name: "ValidationError",
                message: response.error.message,
                errors: [
                    ...response.error.errors.map(function (error, i) {

                        const message = error.message || response.error.message;
                        const path = error.path || "";

                        return {
                            message,
                            path,
                        }

                    })
                ]
            };

            if (p.projection?.error) {
                response.error = error;
            } else {

                delete error.message;
                throw new GraphQLError(
                    response.error.message,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    error
                );

            }

        }

    }

    function createGetResolverFunction({resolverProperties, resolverName}) {

        if (!resolverProperties){
            return null;
        }

        return function getResolver(TC) {

            const rP = (typeof resolverProperties == "function") ? resolverProperties({TC, Model, statusManager}) : {...resolverProperties};

            const {extendResolver} = rP;

            let defaultResolver;

            try {
                defaultResolver = TC.getResolver(extendResolver)
            } catch (e){}

            const resolve = rP.resolve || (defaultResolver && defaultResolver.resolve) || async function () { return null };

            return {
                name: resolverName,
                type: (defaultResolver && defaultResolver.getType()) || TC,
                args: (defaultResolver && defaultResolver.args) || null,
                kind: (defaultResolver && defaultResolver.kind) || "query",
                ...rP,

                resolve: async function(p = {}) {

                    const {context, args} = p;

                    const {req, res} = context;

                    const reqUser = req.wappRequest.user;
                    const input = await getInput({req, res, args});

                    const response = await resolve({...p, input, resolverProperties}) || {}

                    composeValidationError(p, response);

                    return await getOutput({req, res, args, response, userBeforeRequest: reqUser, inputBeforeRequest: input})

                }
            }

        }
    }

    function createResolvers(resolvers) {
        return Object.fromEntries(Object.keys(resolvers).map(function (resolverName){
            return [
                resolverName,
                createGetResolverFunction({
                    resolverProperties: resolvers[resolverName],
                    resolverName: resolverName
                })
            ]
        }));
    }

    return {createResolvers, createGetResolverFunction, getInput, getOutput, filterOutputRecord};

}

export default function getResolvers(p = {}) {

    const {wapp, Model, statusManager} = p;

    const config = (p.config) ? {...p.config} : {};

    if (!wapp.server.graphql){
        wapplrGraphql(p)
    }

    const {
        messages = defaultMessages,
    } = config;

    const resolvers = {
        new: {
            extendResolver: "createOne",
            resolve: async function ({input}){
                const {args, editor, editorIsValidated, allRequiredFieldsAreProvided, missingFields, allFieldsAreValid, invalidFields, mergedErrorFields} = input;
                const {record} = args;

                if (!editorIsValidated){
                    return {
                        error: messages.lowStatusLevel
                    }
                }

                if (!allFieldsAreValid || !allRequiredFieldsAreProvided){
                    return {
                        error: {
                            message: (allRequiredFieldsAreProvided) ? messages.missingData : messages.invalidData,
                            errors: mergedErrorFields
                        },
                    }
                }

                try {
                    const post = new Model({
                        _id: mongoose.Types.ObjectId(),
                        _createdDate: new Date(),
                        _author: editor._id,
                        ...record,
                    });
                    statusManager.setNewStatus(post);
                    const savedPost = await post.save();
                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return {
                        error: {message: e.message || messages.savePostDefaultFail},
                    }
                }

            },
        },
        save: {
            extendResolver: "createOne",
            args: function (TC, schemaComposer) {
                const defaultResolver = TC.getResolver("createOne");
                const defaultRecord = defaultResolver.args.record;
                return {
                    _id: "MongoID!",
                    record: defaultRecord
                }
            },
            resolve: async function ({input}){

                const {
                    args,
                    post,
                    editorIsAuthorOrAdmin,
                    editorIsAdmin,
                    editorIsAuthor,
                    allFieldsAreValid,
                    allRequiredFieldsAreProvided,
                    mergedErrorFields
                } = input;

                const {record} = args;

                if (!post){
                    return {
                        error: {message: messages.postNotFound},
                    }
                }

                if (!editorIsAuthorOrAdmin){
                    return {
                        error: {message: messages.accessDenied},
                    }
                }

                if (!allFieldsAreValid || !allRequiredFieldsAreProvided){
                    return {
                        error: {
                            message: (allRequiredFieldsAreProvided) ? messages.missingData : messages.invalidData,
                            errors: mergedErrorFields
                        },
                    }
                }

                try {

                    function recursiveApply(post, record) {
                        Object.keys(record).forEach(function (key) {
                            if (record[key] && typeof record[key] == "object") {
                                if (!post[key]) {
                                    post[key] = {};
                                }
                                recursiveApply(post[key], record[key])
                            } else {
                                post[key] = record[key];
                            }

                        })
                    }

                    recursiveApply(post, record);

                    if (editorIsAdmin && statusManager.isBanned(post)){
                        statusManager.setRestoreStatusByAdmin(post);
                    } else if (editorIsAuthor && statusManager.isDeleted(post)){
                        statusManager.setRestoreStatusByAuthor(post);
                    } else if (!statusManager.isFeatured(post)){
                        statusManager.setNewStatus(post);
                    }

                    const savedPost = await post.save();

                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return {
                        error: {message: e.message || messages.savePostDefaultFail},
                    }
                }
            },
        },
        delete: {
            extendResolver: "updateById",
            args: function (TC, schemaComposer) {
                return {
                    _id: "MongoID!",
                }
            },
            resolve: async function ({input}){
                const {post, editorIsAuthorOrAdmin} = input;

                if (!post){
                    return {
                        error: {message: messages.postNotFound},
                    }
                }

                if (!editorIsAuthorOrAdmin){
                    return {
                        error: {message: messages.accessDenied},
                    }
                }

                try {
                    statusManager.setDeletedStatus(post)
                    const savedPost = await post.save();
                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return {
                        error: {message: e.message || messages.savePostDefaultFail},
                    }
                }

            },
        },
        approve: {
            extendResolver: "updateById",
            args: function (TC, schemaComposer) {
                return {
                    _id: "MongoID!",
                }
            },
            resolve: async function ({input}){
                const {post, editorIsAdmin} = input;

                if (!post){
                    return {
                        error: {message: messages.postNotFound},
                    }
                }

                if (!editorIsAdmin){
                    return {
                        error: {message: messages.accessDenied},
                    }
                }

                try {
                    statusManager.setApproveStatus(post)
                    const savedPost = await post.save();
                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return {
                        error: {message: e.message || messages.savePostDefaultFail},
                    }
                }

            },
        },
        featured: {
            extendResolver: "updateById",
            args: function (TC, schemaComposer) {
                return {
                    _id: "MongoID!",
                }
            },
            resolve: async function ({input}){
                const {post, editorIsAdmin} = input;

                if (!post){
                    return {
                        error: {message: messages.postNotFound},
                    }
                }

                if (!editorIsAdmin){
                    return {
                        error: {message: messages.accessDenied},
                    }
                }

                try {
                    statusManager.setFeaturedStatus(post)
                    const savedPost = await post.save();
                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return {
                        error: {message: e.message || messages.savePostDefaultFail},
                    };
                }

            },
        },
        ban: {
            extendResolver: "updateById",
            args: function (TC, schemaComposer) {
                return {
                    _id: "MongoID!",
                }
            },
            resolve: async function ({input}){
                const {post, editorIsAdmin} = input;

                if (!post){
                    return {
                        error: {message: messages.postNotFound},
                    }
                }

                if (!editorIsAdmin){
                    return {
                        error: {message: messages.accessDenied},
                    }
                }

                try {
                    statusManager.setBanStatus(post)
                    const savedPost = await post.save();
                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return {
                        error: {message: e.message || messages.savePostDefaultFail},
                    }
                }
            },
        },
        findById: {
            extendResolver: "findById",
            resolve: async function ({input}) {
                const {post} = input;
                return post;
            },
        },
        findMany: {
            extendResolver: "findMany",
        },
        ...(config.resolvers) ? config.resolvers : {}
    }

    const {createResolvers} = getHelpersForResolvers({wapp, Model, statusManager, messages});

    return wapp.server.graphql.addResolversToTC({resolvers: createResolvers(resolvers), TCName: Model.modelName})

}
