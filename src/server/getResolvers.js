import mongoose from "mongoose";
import wapplrGraphql from "wapplr-graphql";
import { GraphQLError } from "graphql-compose/lib/graphql";

import {capitalize} from "../common/utils";
import getConstants from "./getConstants";

export function getHelpersForResolvers(p = {}) {

    const defaultConstants = getConstants(p);
    const {wapp, Model, statusManager, messages = defaultConstants.messages} = p;
    const {authorStatusManager = statusManager} = p;

    const jsonSchema = Model.getJsonSchema();

    const objectIdPattern = /^[0-9A-Fa-f]{24}$/;

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
                const xRef = innerSchema["x-ref"];
                const readOnly = !!(innerSchema.wapplr && innerSchema.wapplr.readOnly);
                const disabled = !!(innerSchema.wapplr && innerSchema.wapplr.disabled);
                const required = !!(innerSchema.wapplr && innerSchema.wapplr.required);
                const pattern = (innerSchema.wapplr && innerSchema.wapplr.pattern) ?
                    innerSchema.wapplr.pattern :
                    (innerSchema.pattern) ?
                        new RegExp(innerSchema.pattern) :
                        (innerSchema.items?.pattern) ?
                            new RegExp(innerSchema.items?.pattern) :
                            (xRef) ?
                                objectIdPattern : null;

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

                        const valueType = (value && typeof value === "object" && typeof value.length === "number") ? "array" : typeof value;
                        if ((value !== null && value !== undefined && innerSchema.type && valueType === innerSchema.type)) {

                            let invalidArrayItems = false;
                            if (valueType === "array"){
                                if (pattern && value.filter((item)=>item && item.toString().match(pattern)).length !== value.length){
                                    invalidArrayItems = true;
                                }
                            }

                            if ((valueType !== "array" && pattern && value.toString().match(pattern)) || (valueType !== "array" && !pattern) || (!invalidArrayItems && valueType === "array")) {
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
        };

        if (filteredRecord){
            filteredArgs.record = filteredRecord;
        }

        return filteredArgs;
    }

    async function getInput(p = {}, inputPost) {

        const {req, res, args = {}} = p;
        const reqUser = req.wappRequest.user;
        const {record, filter} = args;

        const findProps = getFindProps(args);
        const post = inputPost || await getPost(findProps);

        const editor = (reqUser && reqUser._id) ? reqUser : null;

        //const editorPostType = (editor && req.session.modelName) ? await wapp.server.postTypes.getPostType({name: req.session.modelName.toLowerCase()}) : null;
        //const editorStatusManager = editorPostType ? editorPostType.statusManager : authorStatusManager;

        const author = (post && post._author) ? (post._author._id) ? post._author._id : post._author : filter?._author ? filter._author : null;
        const editorIsAuthor = !!(editor && author && editor._id && editor._id.toString() === author.toString());
        const editorIsAdmin = !!(editor && editor._id && editor._status_isFeatured);
        const editorIsNotDeleted = !!(editor && editor._id && editor._status_isNotDeleted);
        const editorIsValidated = !!(editor && editor._id && editor._status_isValidated);
        const editorIsAuthorOrAdmin = !!(editorIsAuthor || editorIsAdmin);
        const authorIsNotDeleted = !!(
            (post && typeof post._author_status_isNotDeleted !== "undefined") ? post._author_status_isNotDeleted :
                (post && author && authorStatusManager.isNotDeleted({_id: author, _status: post._author_status}))
        );

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
            authorIsNotDeleted,
            allRequiredFieldsAreProvided,
            missingFields,
            allFieldsAreValid,
            invalidFields,
            mergedErrorFields
        };

    }


    async function filterOutputRecord(record, isAdmin, isAuthorOrAdmin, authorIsNotDeleted, isNotDeleted, isBanned, schema = jsonSchema) {
        const filteredRecord = {};
        if (schema.type === "object" && schema.properties && record){
            await Promise.all(Object.keys(schema.properties).map(async function (key) {

                const innerSchema = schema.properties[key];
                const value = record[key];

                const privateFunctionResponse = innerSchema.wapplr && typeof innerSchema.wapplr.private == "function" ? await innerSchema.wapplr.private({record, key, value}) : null;

                const isPrivateForAdmin = !!((innerSchema.wapplr && innerSchema.wapplr.private === "admin") || (privateFunctionResponse === "admin"));
                const isPrivateForAuthor = !!((innerSchema.wapplr && innerSchema.wapplr.private === "author") || (privateFunctionResponse === "author"));

                if (( !isPrivateForAdmin && !isPrivateForAuthor ) || (isPrivateForAdmin && isAdmin) || (isPrivateForAuthor && isAuthorOrAdmin)) {
                    if (isNotDeleted || (!isNotDeleted && isAuthorOrAdmin) || key === "_id" || (key && key.match("_status"))) {
                        if (!isBanned || (isBanned && isAdmin) || key === "_id" || (key && key.match("_status"))) {
                            if (authorIsNotDeleted || (!authorIsNotDeleted && isAdmin) || key === "_id" || (key && key.match("_status"))) {
                                if (innerSchema.type === "object" && innerSchema.properties) {
                                    if (typeof value == "object") {
                                        filteredRecord[key] = await filterOutputRecord(value, isAdmin, isAuthorOrAdmin, authorIsNotDeleted, isNotDeleted, isBanned, innerSchema)
                                    }
                                } else {
                                    filteredRecord[key] = value;
                                }
                            }
                        }
                    }
                }

            }))
        }

        return (Object.keys(filteredRecord).length || typeof record == "object") ? filteredRecord : null;
    }

    async function getOutput(p = {}) {

        const {req, res, args, response, userBeforeRequest, inputBeforeRequest} = p;

        if (
            (req.user?._id && response?._id && req.user._id.toString() === response._id.toString()) ||
            (req.user?._id && response?.record?._id && req.user._id.toString() === response.record._id.toString())
        ) {
            await wapp.server.session.populateItemMiddleware(req, res);
        }

        const sameUser = (
            (
                userBeforeRequest &&
                userBeforeRequest._id &&
                req.wappRequest.user &&
                req.wappRequest.user._id.toString() === userBeforeRequest._id.toString() &&
                req.wappRequest.user._status === userBeforeRequest._status
            ) ||
            (!userBeforeRequest && !req.wappRequest.user)
        );

        const {editorIsAdmin, editorIsAuthorOrAdmin, authorIsNotDeleted} = (sameUser) ? inputBeforeRequest : await getInput({req, res, args});

        let filteredResponse;

        if (response && typeof response == "object" && typeof response.length == "undefined") {

            const responseToObject = (response.toObject) ?
                response.toObject() :
                Object.fromEntries(Object.keys(response).map(function (key) {
                    return [key, (response[key] && response[key].toObject) ? response[key].toObject() : response[key]]
                }));

            filteredResponse = {...responseToObject};

            const {record, items, records} = responseToObject;

            if (record) {
                filteredResponse.record = await filterOutputRecord(record, editorIsAdmin, editorIsAuthorOrAdmin, authorIsNotDeleted, statusManager.isNotDeleted(filteredResponse.record), statusManager.isBanned(filteredResponse.record));
            } else if (items && items.length) {
                filteredResponse.items = await Promise.all(items.map(async function (post) {
                    post = (post && post.toObject) ? post.toObject() : post;
                    if (post && post._id){
                        const {editorIsAdmin, editorIsAuthorOrAdmin, authorIsNotDeleted} = await getInput({req, res, args}, post);
                        return await filterOutputRecord(post, editorIsAdmin, editorIsAuthorOrAdmin, authorIsNotDeleted, post._status_isNotDeleted, post._status_isBanned)
                    }
                    return post;
                }));
            } else if (records && records.length) {
                filteredResponse.records = await Promise.all(records.map(async function (post) {
                    post = (post && post.toObject) ? post.toObject() : post;
                    if (post && post._id){
                        const {editorIsAdmin, editorIsAuthorOrAdmin, authorIsNotDeleted} = await getInput({req, res, args}, post);
                        return await filterOutputRecord(post, editorIsAdmin, editorIsAuthorOrAdmin, authorIsNotDeleted, post._status_isNotDeleted, post._status_isBanned)
                    }
                    return post;
                }));
            } else if (responseToObject._id){
                filteredResponse = await filterOutputRecord(responseToObject, editorIsAdmin, editorIsAuthorOrAdmin, authorIsNotDeleted, statusManager.isNotDeleted(responseToObject), statusManager.isBanned(responseToObject));
            }

        } else if (response && typeof response == "object" && typeof response.length == "number") {

            filteredResponse = await Promise.all(response.map(async function (post) {
                post = (post && post.toObject) ? post.toObject() : post;
                if (post && post._id){
                    const {editorIsAdmin, editorIsAuthorOrAdmin, authorIsNotDeleted} = await getInput({req, res, args}, post);
                    return await filterOutputRecord(post, editorIsAdmin, editorIsAuthorOrAdmin, authorIsNotDeleted, post._status_isNotDeleted, post._status_isBanned)
                }
                return post;
            }))

        }

        return filteredResponse;

    }

    function composeValidationError(p, response) {

        if (response && response.error){

            const error = {
                message: response.error.message,
            };

            if (response.error.errors){
                error.name = "ValidationError";
                error.errors = [
                    ...response.error.errors.map(function (error) {

                        const message = error.message || response.error.message;
                        const path = error.path || "";

                        return {
                            message,
                            path,
                        }

                    })
                ]
            }

            if (p.projection?.error) {
                response.error = error;
            } else {

                const message = error.message;
                delete error.message;

                throw new GraphQLError(
                    message,
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

        return function getResolver(TC, schemaComposer) {

            const rP = (typeof resolverProperties == "function") ? resolverProperties({TC, Model, statusManager, authorStatusManager, schemaComposer}) : {...resolverProperties};

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

                    const response = await resolve({...p, input, resolverProperties, defaultResolver});

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

    const {wapp, Model, statusManager, authorModelName = "User", name = "post", database} = p;
    const authorStatusManager = p.authorStatusManager || statusManager;

    const n = name;
    const N = capitalize(n);

    const config = (p.config) ? {...p.config} : {};

    if (!wapp.server.graphql){
        wapplrGraphql(p)
    }

    const defaultConstants = getConstants(p);

    const {
        messages = defaultConstants.messages,
        beforeCreateResolvers,
        masterCode = "",
        perPage = {
            limit: 100,
            default: 20
        },
        ...rest
    } = config;

    const AuthorModel = database.getModel({modelName: authorModelName});

    const resolvers = {
        new: {
            extendResolver: "createOne",
            resolve: async function ({input}){
                const {args, editor, editorIsValidated, allRequiredFieldsAreProvided, allFieldsAreValid, mergedErrorFields, editorIsAdmin} = input;
                const {record, _author} = args;

                if (!editorIsValidated){
                    return {
                        error: {message: messages.lowStatusLevel}
                    }
                }

                if (!allFieldsAreValid || !allRequiredFieldsAreProvided){
                    return {
                        error: {
                            message: (!allRequiredFieldsAreProvided) ? messages.missingData : messages.invalidData,
                            errors: mergedErrorFields
                        },
                    }
                }

                const author = (editorIsAdmin && _author) ? await AuthorModel.findById(_author) : editor;

                try {
                    const post = new Model({
                        _id: mongoose.Types.ObjectId(),
                        _createdDate: new Date(),
                        _author: (author && author._id) ? author._id : editor._id,
                        ...record,
                    });
                    statusManager.setNewStatus(post);
                    post._author_status = (author && author._id) ? author._status : editor._status;
                    const savedPost = await post.save();
                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return {
                        error: {message: e.message || messages["save"+N+"DefaultFail"]},
                    }
                }

            },
        },
        save: {
            extendResolver: "updateById",
            args: function (TC) {
                const defaultResolver = TC.getResolver("updateById");
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
                    editorIsAuthor,
                    editorIsAuthorOrAdmin,
                    editorIsAdmin,
                    allFieldsAreValid,
                    allRequiredFieldsAreProvided,
                    mergedErrorFields
                } = input;

                const {record} = args;

                if (!post){
                    return {
                        error: {message: messages[n+"NotFound"]},
                    }
                }

                if (!editorIsAuthorOrAdmin || (!editorIsAdmin && post._status_isBanned) || (post._status_isFeatured && !editorIsAuthor)){
                    return {
                        error: {message: messages.accessDenied},
                    }
                }

                if (!allFieldsAreValid || !allRequiredFieldsAreProvided){
                    return {
                        error: {
                            message: (!allRequiredFieldsAreProvided) ? messages.missingData : messages.invalidData,
                            errors: mergedErrorFields
                        },
                    }
                }

                try {

                    function recursiveApply(post, record) {
                        Object.keys(record).forEach(function (key) {
                            if (record[key] && typeof record[key] == "object" && typeof record[key].length !== "number") {
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

                    if (editorIsAdmin && post._status_isBanned){
                        statusManager.setRestoreStatusByAdmin(post);
                    } else if (editorIsAuthorOrAdmin && post._status_isDeleted){
                        statusManager.setRestoreStatusByAuthor(post);
                    } else if (!post._status_isFeatured){
                        statusManager.setNewStatus(post);
                    }

                    const savedPost = await post.save();

                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return {
                        error: {message: e.message || messages["save"+N+"DefaultFail"]},
                    }
                }
            },
        },
        delete: {
            extendResolver: "updateById",
            args: function () {
                return {
                    _id: "MongoID!",
                }
            },
            resolve: async function ({input}){
                const {post, editorIsAuthorOrAdmin, editorIsAdmin} = input;

                if (!post){
                    return {
                        error: {message: messages[n+"NotFound"]},
                    }
                }

                if (!editorIsAuthorOrAdmin || (!editorIsAdmin && post._status_isBanned) || post._status_isFeatured){
                    return {
                        error: {message: messages.accessDenied},
                    }
                }

                try {
                    statusManager.setDeletedStatus(post);
                    const savedPost = await post.save();
                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return {
                        error: {message: e.message || messages["save"+N+"DefaultFail"]},
                    }
                }

            },
        },
        approve: {
            extendResolver: "updateById",
            args: function () {
                return {
                    _id: "MongoID!",
                }
            },
            resolve: async function ({input}){
                const {post, editorIsAdmin} = input;

                if (!post){
                    return {
                        error: {message: messages[n+"NotFound"]},
                    }
                }

                if (!editorIsAdmin || post._status_isFeatured){
                    return {
                        error: {message: messages.accessDenied},
                    }
                }

                try {
                    statusManager.setApproveStatus(post);
                    const savedPost = await post.save();
                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return {
                        error: {message: e.message || messages["save"+N+"DefaultFail"]},
                    }
                }

            },
        },
        featured: {
            extendResolver: "updateById",
            args: function () {
                return {
                    _id: "MongoID!",
                    masterCode: "String!"
                }
            },
            wapplr: {
                masterCode: {
                    wapplr: {
                        pattern: Model.getJsonSchema({doNotDeleteDisabledFields: true}).properties.password?.wapplr?.pattern,
                        validationMessage: messages.validationPassword,
                        formData: {
                            label: "Master code",
                            type: "password"
                        }
                    }
                },
            },
            resolve: async function ({input}){
                const {post, editorIsAdmin, args} = input;

                const inputMasterCode = args.masterCode || "";

                if (!post){
                    return {
                        error: {message: messages[n+"NotFound"]},
                    }
                }

                if (!editorIsAdmin || !post._status_isApproved || masterCode !== inputMasterCode){
                    return {
                        error: {message: messages.accessDenied},
                    }
                }

                try {
                    statusManager.setFeaturedStatus(post);
                    const savedPost = await post.save();
                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return {
                        error: {message: e.message || messages["save"+N+"DefaultFail"]},
                    };
                }

            },
        },
        removeFeatured: {
            extendResolver: "updateById",
            args: function () {
                return {
                    _id: "MongoID!",
                    masterCode: "String!"
                }
            },
            wapplr: {
                masterCode: {
                    wapplr: {
                        pattern: Model.getJsonSchema({doNotDeleteDisabledFields: true}).properties.password?.wapplr?.pattern,
                        validationMessage: messages.validationPassword,
                        formData: {
                            label: "Master code",
                            type: "password"
                        }
                    }
                },
            },
            resolve: async function ({input}){
                const {post, editorIsAdmin, args} = input;

                const inputMasterCode = args.masterCode || "";

                if (!post){
                    return {
                        error: {message: messages[n+"NotFound"]},
                    }
                }

                if (!editorIsAdmin || !post._status_isFeatured || masterCode !== inputMasterCode){
                    return {
                        error: {message: messages.accessDenied},
                    }
                }

                try {
                    statusManager.removeFeaturedStatus(post, masterCode);
                    const savedPost = await post.save();
                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return {
                        error: {message: e.message || messages["save"+N+"DefaultFail"]},
                    };
                }

            },
        },
        ban: {
            extendResolver: "updateById",
            args: function () {
                return {
                    _id: "MongoID!",
                }
            },
            resolve: async function ({input}){
                const {post, editorIsAdmin} = input;

                if (!post){
                    return {
                        error: {message: messages[n+"NotFound"]},
                    }
                }

                if (!editorIsAdmin || post._status_isFeatured){
                    return {
                        error: {message: messages.accessDenied},
                    }
                }

                try {
                    statusManager.setBanStatus(post);
                    const savedPost = await post.save();
                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return {
                        error: {message: e.message || messages["save"+N+"DefaultFail"]},
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
        findMany: ({TC, authorStatusManager, schemaComposer}) => {

            const defaultResolver = TC.getResolver("pagination").addFilterArg({
                name: "search",
                type: "String",
                query: (query, value, resolveParams) => {
                    if (!resolveParams.args.sort) {
                        resolveParams.args.sort = {
                            score: {$meta: "textScore"},
                        };
                    }
                    query.$text = { $search: value };
                    resolveParams.projection.score = { $meta: "textScore" };
                },
            });

            try {
                const PaginationInfoOT = schemaComposer.getOTC("PaginationInfo");
                PaginationInfoOT.addFields({
                    sort: {
                        type: "String"
                    }
                })
            } catch (e){}

            TC.setResolver("paginationWithSearch", defaultResolver);

            return {
                extendResolver: "paginationWithSearch",
                wapplr: {
                    perPage: {
                        wapplr: {
                            listData: {
                                perPage
                            }
                        }
                    },
                },
                resolve: async function(p) {

                    const {defaultResolver, args, input} = p;
                    const {filter = {}} = args;
                    const {_operators = {}} = filter;

                    const {editorIsAdmin, editorIsAuthor} = input;

                    if (!args.perPage || args.perPage < 1 || args.perPage > perPage.limit){
                        args.perPage = perPage.default;
                    }

                    const enabledStatusFilters = (editorIsAuthor) ? [
                        {gt: statusManager.getMinStatus() - 1},
                        {gt: statusManager.getDefaultStatus() - 1},
                        {gt: statusManager.getDeletedStatus() - 1, lt: statusManager.getDefaultStatus()},
                        {gt: statusManager.getDefaultStatus() - 1, lt: statusManager.getMinStatus()},
                    ] : [
                        {gt: statusManager.getMinStatus() - 1}
                    ];

                    if (!_operators._status && !editorIsAdmin){
                        _operators._status = enabledStatusFilters[0];
                    }

                    if (!editorIsAdmin) {
                        const statusField = _operators._status;
                        const foundEnabledStatusFilter = enabledStatusFilters.find((enabledFilter)=>{
                            return (statusField.gt === enabledFilter.gt && statusField.lt === enabledFilter.lt && Object.keys(enabledFilter).sort().join(",") === Object.keys(statusField).sort().join(","))
                        });
                        if (!foundEnabledStatusFilter) {
                            return {data: null, error: {message: messages.accessDenied}}
                        }
                    }

                    if (authorStatusManager){

                        const enabledAuthorStatusFilters = (editorIsAuthor) ? [
                            {gt: authorStatusManager.getMinStatus() - 1},
                            {gt: authorStatusManager.getDefaultStatus() - 1}
                        ] : [
                            {gt: authorStatusManager.getMinStatus() - 1}
                        ];

                        if (!_operators._author_status && !editorIsAdmin){
                            _operators._author_status = enabledAuthorStatusFilters[0];
                        }

                        if (!editorIsAdmin) {
                            const authorStatusField = _operators._author_status;
                            const foundEnabledAuthorStatusFilter = enabledAuthorStatusFilters.find((enabledFilter) => {
                                return (authorStatusField.gt === enabledFilter.gt && authorStatusField.lt === enabledFilter.lt && Object.keys(enabledFilter).sort().join(",") === Object.keys(authorStatusField).sort().join(","))
                            });
                            if (!foundEnabledAuthorStatusFilter) {
                                return {data: null, error: {message: messages.accessDenied}}
                            }
                        }

                    }

                    const r = await defaultResolver.resolve(p);
                    if (r.pageInfo){
                        r.pageInfo.sort = (typeof args.sort === "object" && Object.keys(args.sort) && input.req.body.variables?.sort) || null
                    }
                    return r;
                }
            }

        },
        ...(config.resolvers) ? config.resolvers : {}
    };

    const helpersForResolvers = getHelpersForResolvers({wapp, Model, statusManager, authorStatusManager, authorModelName, messages});

    if (beforeCreateResolvers){
        beforeCreateResolvers(resolvers, {...p, helpersForResolvers, config: {...rest, messages, masterCode}});
    }

    const {createResolvers} = helpersForResolvers;

    return {resolvers: wapp.server.graphql.addResolversToTC({resolvers: createResolvers(resolvers), TCName: Model.modelName}), helpersForResolvers}

}
