import defaultMessages from "./defaultMessages";
import mongoose from "mongoose";
import wapplrGraphql from "wapplr-graphql";

export function getHelpersForResolvers({wapp, Model, statusManager}) {

    const jsonSchema = Model.getJsonSchema();


    function filterInputRecord(record, schema, parentKey) {

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

                const nextKey = (parentKey) ? parentKey + "." + key : key;

                if (!readOnly && !disabled) {
                    if (innerSchema.type === "object" && innerSchema.properties) {
                        if (typeof value == "object") {
                            const filteredInputResponse = filterInputRecord(value, innerSchema, nextKey);
                            filteredRecord[key] = filteredInputResponse.record;
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
                                missingFields.push(nextKey)
                            }
                        }
                    } else {
                        if (innerSchema.type && typeof value === innerSchema.type) {
                            if (pattern && value.match(pattern)) {
                                filteredRecord[key] = value;
                            } else if (!pattern){
                                filteredRecord[key] = value;
                            } else if (required){
                                allRequiredFieldsAreProvided = false;
                                missingFields.push(nextKey);
                                if (pattern){
                                    allFieldsAreValid = false;
                                    invalidFields.push(nextKey);
                                }
                            }
                        } else {
                            if (required){
                                allRequiredFieldsAreProvided = false;
                                missingFields.push(nextKey)
                            }
                        }
                    }
                }

            })
        }

        return {
            record: (Object.keys(filteredRecord).length || typeof record == "object") ? filteredRecord : null,
            allRequiredFieldsAreProvided,
            missingFields,
            allFieldsAreValid,
            invalidFields
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
        }
        if (email){
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
        const reqUser = req.user;
        const {record} = args;

        const findProps = getFindProps(args);
        const post = inputPost || await getPost(findProps);

        const editor = (reqUser && reqUser._id) ? reqUser : null;
        const author = post && post._author;
        const editorIsAuthor = !!(editor && author && editor._id && editor._id.toString() === author.toString());
        const editorIsAdmin = !!(editor && editor._id && statusManager.isFeatured(editor));
        const editorIsNotDeleted = !!(editor && editor._id && statusManager.isNotDeleted(editor));
        const editorIsValidated = !!(editor && editor._id && statusManager.isValidated(editor));
        const editorIsAuthorOrAdmin = !!(editorIsAuthor || editorIsAdmin);

        const filteredRecordResponse = filterInputRecord(record, jsonSchema);
        const filteredRecord = filteredRecordResponse.record;
        const allRequiredFieldsAreProvided = filteredRecordResponse.allRequiredFieldsAreProvided;
        const missingFields = filteredRecordResponse.missingFields;
        const allFieldsAreValid = filteredRecordResponse.allFieldsAreValid;
        const invalidFields = filteredRecordResponse.invalidFields;

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
            invalidFields
        };

    }



    function filterOutputRecord(record, schema, isAdmin, isAuthorOrAdmin) {
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
                            filteredRecord[key] = filterOutputRecord(value, innerSchema, isAdmin, isAuthorOrAdmin)
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
            (userBeforeRequest && userBeforeRequest._id && req.user && req.user._id.toString() === userBeforeRequest._id.toString()) ||
            (!userBeforeRequest && !req.user)
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
                filteredResponse.record = filterOutputRecord(record, jsonSchema, editorIsAdmin, editorIsAuthorOrAdmin);
            } else if (responseToObject._id){
                filteredResponse = filterOutputRecord(responseToObject, jsonSchema, editorIsAdmin, editorIsAuthorOrAdmin);
            }

        } else if (response && typeof response == "object" && typeof response.length == "number") {

            filteredResponse = await Promise.all(response.map(async function (post) {
                post = (post && post.toObject) ? post.toObject() : post;
                if (post && post._id){
                    const {editorIsAdmin, editorIsAuthorOrAdmin} = (sameUser) ? inputBeforeRequest : await getInput({req, res, args}, post);
                    return filterOutputRecord(post, jsonSchema, editorIsAdmin, editorIsAuthorOrAdmin)
                }
                return post;
            }))

        }

        return filteredResponse;

    }

    function createGetResolverFunction({resolverProperties, resolverName}) {

        if (!resolverProperties){
            return null;
        }

        return function getResolver(TC) {

            const {extendResolver} = resolverProperties;

            let defaultResolver;

            try {
                defaultResolver = TC.getResolver(extendResolver)
            } catch (e){}

            const resolve = resolverProperties.resolve || (defaultResolver && defaultResolver.resolve) || async function () { return null }

            return {
                name: resolverName,
                type: (defaultResolver && defaultResolver.getType()) || TC,
                args: (defaultResolver && defaultResolver.args) || null,
                kind: (defaultResolver && defaultResolver.kind) || "query",
                ...resolverProperties,

                resolve: async function(p = {}) {

                    const {context, args} = p;

                    const {req, res} = context;

                    const reqUser = req.user;
                    const input = await getInput({req, res, args});

                    const response = await resolve({...p, input}) || {}

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

    return {createResolvers, createGetResolverFunction, getInput, getOutput};

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
                const {args, editor, editorIsValidated, allRequiredFieldsAreProvided, allFieldsAreValid} = input;
                const {record} = args;

                if (!editorIsValidated){
                    return {
                        error: messages.lowStatusLevel
                    }
                }

                if (!allFieldsAreValid){
                    return {
                        error: {message: messages.invalidData + " [" +input.invalidFields.join(", ") +"]"},
                    }
                }

                if (!allRequiredFieldsAreProvided){
                    return {
                        error: {message: messages.missingData + " [" +input.missingFields.join(", ") +"]"},
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
            extendResolver: "updateById",
            resolve: async function ({input}){
                const {args, post, editorIsAuthorOrAdmin, editorIsAdmin, editorIsAuthor, allRequiredFieldsAreProvided, allFieldsAreValid} = input;
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

                if (!allFieldsAreValid){
                    return {
                        error: {message: messages.invalidData + " [" +input.invalidFields.join(", ") +"]"},
                    }
                }

                if (!allRequiredFieldsAreProvided){
                    return {
                        error: {message: messages.missingData + " [" +input.missingFields.join(", ") +"]"},
                    }
                }

                try {

                    function recursiveApply(post, record) {
                        Object.keys(record).forEach(function (key) {
                            if (record[key] && typeof record[key] == "object") {
                                recursiveApply(post[key] || {}, record[key])
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

    const {createResolvers} = getHelpersForResolvers({wapp, Model, statusManager});

    return wapp.server.graphql.addResolversToTC({resolvers: createResolvers(resolvers), TCName: Model.modelName})

}
