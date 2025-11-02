import mongoose from "mongoose";
import wapplrGraphql from "wapplr-graphql";
import { GraphQLError } from "graphql-compose/lib/graphql";

import {capitalize} from "../common/utils";
import getConstants from "./getConstants";
import {copyObject} from "wapplr/dist/common/utils";

export function getHelpersForResolvers(p = {}) {

    const defaultConstants = getConstants(p);
    const {wapp, Model, statusManager, messages = defaultConstants.messages} = p;
    const {authorStatusManager = statusManager} = p;

    const jsonSchema = Model.getJsonSchema();

    const objectIdPattern = /^[0-9A-Fa-f]{24}$/;

    function filterInputRecord(permissions, record, parentKey, schema = jsonSchema) {

        const filteredRecord = {};
        let allRequiredFieldsAreProvided = !!(record);
        const missingFields = [];
        let allFieldsAreValid = true;
        const invalidFields = [];

        if (schema.type === "object" && schema.properties && record){
            Object.keys(schema.properties).forEach(function (key) {

                const innerSchema = schema.properties[key];
                const value = record[key];
                const ref = innerSchema.wapplr?.ref || innerSchema.ref || innerSchema["x-ref"];
                const readOnly = !!(innerSchema.wapplr?.readOnly);
                const disabled = !!(innerSchema.wapplr?.disabled);
                const required = !!(innerSchema.wapplr?.required || innerSchema.required);
                let pattern = (innerSchema.wapplr?.pattern) ?
                    innerSchema.wapplr.pattern :
                    (innerSchema.pattern) ?
                        innerSchema.pattern :
                        (innerSchema.items?.pattern) ?
                            innerSchema.items?.pattern :
                            (ref) ?
                                objectIdPattern : null;

                if (typeof pattern === "string"){
                    pattern = new RegExp(pattern);
                }

                const validationMessage = (innerSchema.wapplr && typeof innerSchema.wapplr.validationMessage == "string") ? innerSchema.wapplr.validationMessage : messages.invalidData;
                let validationMessageForValidate = validationMessage;

                let validate = (innerSchema.wapplr?.validate || innerSchema.validate);
                if (typeof validate === "object" && typeof validate.length === "number"){
                    if (typeof validate[1] === "string"){
                        validationMessageForValidate = validate[1];
                    }
                    validate = validate[0];
                }

                const writeCondition = innerSchema.wapplr?.writeCondition;
                const canWriteAdmin = (writeCondition === "admin");
                const canWriteAuthorOrAdmin = (permissions?.post?._id && !canWriteAdmin);
                const canWriteEverybody = (!permissions?.post?._id && !canWriteAdmin);

                const nextKey = (parentKey) ? parentKey + "." + key : key;

                if (typeof value !== "undefined" && !readOnly && !disabled) {

                    if (
                        (canWriteEverybody) ||
                        (canWriteAuthorOrAdmin && permissions?.editorIsAuthorOrAdmin) ||
                        (canWriteAdmin && permissions?.editorIsAdmin)
                    ) {

                        // the user has write-access to the field

                        if (innerSchema.type === "object" && innerSchema.properties) {

                            //if a nested object according to the schema

                            if (value && typeof value == "object") {

                                //if the value is an object, the recursive process starts and concatenates the responses

                                const filteredInputResponse = filterInputRecord(permissions, value, nextKey, innerSchema);
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

                                    //if the value is not an object, but its entry is required

                                    allRequiredFieldsAreProvided = false;
                                    missingFields.push({path: "record."+nextKey, message: messages.missingData})
                                }

                                //if it is not an object, but not required, it is simply skipped

                            }
                        } else {

                            //additional inputs that are not nested objects

                            const valueType = (value && Array.isArray(value)) ? "array" : typeof value;

                            const isEmptyArray = valueType === 'array' && !value?.length;
                            const isExist = (value !== null && value !== undefined && value !== false && value !== '' && !isEmptyArray);
                            const isValidType = (innerSchema.type && valueType === innerSchema.type);
                            const isValidTypeOrNull = isValidType || value === null;

                            let needToValidate = true;

                            if (required && !isExist) {

                                // if it is required but the value is null, undefined, false, or an empty string, or an empty array

                                allRequiredFieldsAreProvided = false;
                                missingFields.push({path: "record." + nextKey, message: messages.missingData});
                                needToValidate = false;

                            }

                            if (!isValidTypeOrNull) {

                                // is an invalid type that is not null

                                allFieldsAreValid = false;
                                invalidFields.push({path: "record."+nextKey, message: messages.invalidData});
                                needToValidate = false;

                            }

                            if (needToValidate) {

                                // needs to be validated, this means based on the above that there was no type error or missing value

                                const validByValidate = ((validate && validate(value)) || !validate);

                                if (!validByValidate) {

                                    // invalid value by the validator function

                                    allFieldsAreValid = false;
                                    invalidFields.push({path: "record."+nextKey, message: validationMessageForValidate});

                                } else {

                                    let validByPattern = true;

                                    if (pattern) {

                                        // it is necessary to validate because there is a given pattern

                                        if (valueType === "array") {

                                            if (value) {

                                                // the array can only contain elements that match the pattern

                                                if (value.filter((item) => {
                                                    const string = item && item.toString ? item.toString() : '';
                                                    const isError = !string.match(pattern);
                                                    return !isError
                                                }).length !== value.length) {
                                                    validByPattern = false
                                                }

                                            }

                                            // allows the empty array

                                        } else {

                                            if ( (typeof value === 'string' && value) || typeof value === 'number' ) {

                                                // if it's not an array, the pattern only checks non-empty strings and numbers

                                                const string = (value || value === 0) && value.toString ? value.toString() : '';
                                                const isError = !string.match(pattern);
                                                if (isError) {
                                                    validByPattern = false;
                                                }

                                            }

                                        }

                                    }

                                    if (!validByPattern) {

                                        // if it found an invalid value

                                        allFieldsAreValid = false;
                                        invalidFields.push({path: "record."+nextKey, message: validationMessage});

                                    } else {

                                        // if the value is valid

                                        filteredRecord[key] = value;

                                    }

                                }

                            }

                        }

                    } else {

                        // access denied

                        allFieldsAreValid = false;
                        invalidFields.push({path: "record."+nextKey, message: messages.accessDenied});
                    }
                }

            })
        }

        const mergedErrorFields = [
            ...missingFields,
            ...invalidFields.filter(function (invalidField) {
                return !(missingFields.filter(function (missingField) { return (missingField.path === invalidField.path) }).length)
            })
        ];

        return {
            record: (Object.keys(filteredRecord).length || typeof record == "object") ? filteredRecord : null,
            allRequiredFieldsAreProvided,
            missingFields,
            allFieldsAreValid,
            invalidFields,
            mergedErrorFields
        }
    }

    function checkInputFilter(filter, parentKey, schema = jsonSchema) {

        const filteredFilter = {};

        if (schema.type === "object" && schema.properties && filter){
            Object.keys(filter).forEach(function (key) {

                const value = filter[key];
                const innerSchema = schema.properties[key];

                if (innerSchema){
                    const nextKey = (parentKey) ? parentKey + "." + key : key;
                    if (typeof value !== "undefined") {

                        if (innerSchema.type === "object" && innerSchema.properties) {
                            if (value && typeof value == "object" && !Array.isArray(value)) {
                                const filteredInputResponse = checkInputFilter(value, nextKey, innerSchema);
                                if (filteredInputResponse.filter && typeof filteredInputResponse.filter == "object") {
                                    filteredFilter[key] = filteredInputResponse.filter;
                                }
                            } else {
                                filteredFilter[key] = value;
                            }
                        } else {
                            if (innerSchema.type === "array" && Array.isArray(value)){
                                filteredFilter[key] = {$in: value}
                            } else {
                                filteredFilter[key] = value;
                            }
                        }
                    }
                } else {
                    filteredFilter[key] = value;
                }
            })
        }

        return {
            filter: (Object.keys(filteredFilter).length) ? filteredFilter : null,
        }
    }

    async function getPost(p) {
        if (p && Object.keys(p).length){
            const post = await Model.findOne({...p});
            if (post && post._id){
                return post;
            }
        }
        return null;
    }

    function getFindProps(args = {}) {

        const findProps = {};

        function rec (args, jsonSchema, findProps, prevKey = "") {
            Object.keys(args).forEach((key) => {
                if ((key === "_id" && !prevKey) || (jsonSchema.properties && jsonSchema.properties[key]?.wapplr?.unique)) {
                    findProps[key] = args[key];
                } else if (args[key] && typeof args[key] === "object" && jsonSchema.properties && jsonSchema.properties[key]?.properties){
                    findProps[key] = {};
                    rec(args[key], jsonSchema.properties[key], findProps[key], key);
                }
            });
        }

        rec(args, jsonSchema, findProps);

        return Object.keys(findProps).length ? findProps : null;
    }

    function getFilteredArgs(args = {}, filteredRecord) {

        const filteredArgs = copyObject(args);

        if (filteredRecord){
            filteredArgs.record = copyObject(filteredRecord);
        }

        if (filteredArgs.filter){
            const checkedFilter = checkInputFilter(filteredArgs.filter);
            filteredArgs.filter = copyObject(checkedFilter.filter);
        }

        return filteredArgs;
    }

    function transformInputArgs(args = {}, resolverProperties) {

        try {

            const transforms = {
                lowercase: (s)=>{
                    if (s && s.toLowerCase) {
                        return s.toLowerCase()
                    }
                    return s;
                },
                trim: (s)=>{
                    if (s && s.trim) {
                        return s.trim()
                    }
                    return s;
                }
            };

            function rec (args, jsonSchema, resolverProperties) {

                Object.keys(args).forEach((key) => {

                    const properties = {
                        ...jsonSchema?.properties && jsonSchema.properties[key]?.wapplr ? jsonSchema.properties[key]?.wapplr : {},
                        ...resolverProperties && resolverProperties[key] && resolverProperties[key].wapplr ? resolverProperties[key].wapplr : {}
                    };

                    if (args[key] && typeof args[key] === "object" &&
                        (
                            (jsonSchema?.properties && jsonSchema.properties[key]?.properties) ||
                            (resolverProperties && typeof resolverProperties[key] === 'object')
                        )
                    ){

                        rec(args[key], jsonSchema?.properties[key], resolverProperties && resolverProperties[key]);

                    } else if (properties.transform) {
                        if (Array.isArray(properties.transform)) {
                            properties.transform.forEach((functionName)=>{
                                const transform = transforms[functionName];
                                if (transform) {
                                    args[key] = transform(args[key])
                                }
                            })
                        } else if (transforms[properties.transform]) {
                            const transform = transforms[properties.transform];
                            args[key] = transform(args[key])
                        }
                    }
                });
            }

            rec(args, jsonSchema, resolverProperties?.wapplr || {})

        } catch (e) {
            console.log('[APP]', 'Error occurred transforming args value', e, args)
        }

    }

    async function getInput(p = {}, inputPost) {

        const {req, res, args = {}, resolverProperties} = p;

        transformInputArgs(args, resolverProperties);

        const {record, filter} = args;

        const reqUser = req.wappRequest.user;

        const findProps = getFindProps(args);
        const post = (resolverProperties?.skipInputPost) ? null : (inputPost) ? inputPost : await getPost(findProps);

        const editor = (reqUser && reqUser._id) ? reqUser : null;

        const isNew = (
            editor?._id &&
            (
                resolverProperties.extendResolver === 'createOne' ||
                resolverProperties.extendResolver === 'createMany'
            ) &&
            ((args._author && args._author === editor?._id.toString()) || !args._author)
        );

        const authorModelName = jsonSchema.properties?._author?.ref || "User";
        const AuthorModel = Model.database.getModel({modelName: authorModelName});

        let filterAuthor = null;

        if (Array.isArray(filter?.OR)) {
            const filterAuthors = filter.OR.map((f)=>f._author);
            const uniqueAuthors = filterAuthors.filter((value, index, array) =>{
                return array.indexOf(value) === index;
            });
            if (uniqueAuthors.length === 1) {
                filterAuthor = uniqueAuthors[0]
            }
        } else {
            filterAuthor = filter?._author;
        }

        const filterAuthorObject = (filterAuthor && resolverProperties?.enableFilterAuthor) ? await AuthorModel.findById(filterAuthor) : null;

        const author = isNew ? editor._id : (post?._author?._id || post?._author || filterAuthorObject?._id);

        const editorIsAuthor = !!(editor && author && editor._id && editor._id.toString() === author.toString());

        const adminAccessKeys = ['_status_isFeatured', ...resolverProperties.adminAccessKeys ? resolverProperties.adminAccessKeys : []];
        const editorIsAdmin = !!(editor && editor._id && adminAccessKeys.find((key)=>editor[key]));

        const editorIsNotDeleted = !!(editor && editor._id && editor._status_isNotDeleted);
        const editorIsValidated = !!(editor && editor._id && editor._status_isValidated);
        const editorIsAuthorOrAdmin = !!(editorIsAuthor || editorIsAdmin);
        const authorIsNotDeleted = isNew ? editorIsNotDeleted : !!(
            (!post && !author) ? true :
                (filterAuthorObject && author) ?
                    filterAuthorObject._status_isNotDeleted :
                    (post && typeof post._author_status_isNotDeleted !== "undefined") ?
                        post._author_status_isNotDeleted :
                        (post && author && authorStatusManager.isNotDeleted({_id: author, _status: post._author_status}))
        );

        const filteredRecordResponse = filterInputRecord({editorIsAuthorOrAdmin, editorIsAdmin, post}, record);
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


    async function filterOutputRecord(req, res, record, isAdmin, isAuthorOrAdmin, authorIsNotDeleted, isNotDeleted, isBanned, schema = jsonSchema) {
        const filteredRecord = {};
        if (schema.type === "object" && schema.properties && record){

            const keys = Object.keys(schema.properties);
            let i = -1;

            let mutable = {};

            async function next() {

                i = i + 1;
                const key = keys[i];

                if (key) {

                    const innerSchema = schema.properties[key];
                    const value = record[key];

                    const privateFunctionResponse = innerSchema.wapplr && typeof innerSchema.wapplr.private == "function" ? await innerSchema.wapplr.private({record, key, value}) : null;

                    const isPrivateForAdmin = !!((innerSchema.wapplr && innerSchema.wapplr.private === "admin") || (privateFunctionResponse === "admin"));
                    const isPrivateForAuthor = !!((innerSchema.wapplr && innerSchema.wapplr.private === "author") || (privateFunctionResponse === "author"));
                    const finalDataFilter = innerSchema.wapplr?.finalDataFilter;

                    if (( !isPrivateForAdmin && !isPrivateForAuthor ) || (isPrivateForAdmin && isAdmin) || (isPrivateForAuthor && isAuthorOrAdmin)) {
                        if (isNotDeleted || (!isNotDeleted && isAuthorOrAdmin) || key === "_id" || (key && key.match("_status"))) {
                            if (!isBanned || (isBanned && isAdmin) || key === "_id" || (key && key.match("_status"))) {
                                if (authorIsNotDeleted || (!authorIsNotDeleted && isAdmin) || key === "_id" || (key && key.match("_status"))) {
                                    if (innerSchema.type === "object" && innerSchema.properties) {
                                        if (typeof value == "object") {
                                            filteredRecord[key] = await filterOutputRecord(req, res, value, isAdmin, isAuthorOrAdmin, authorIsNotDeleted, isNotDeleted, isBanned, innerSchema)
                                        }
                                    } else {
                                        filteredRecord[key] =
                                            (finalDataFilter) ?
                                                await finalDataFilter({
                                                    req,
                                                    res,
                                                    value,
                                                    record,
                                                    isAdmin,
                                                    isAuthorOrAdmin,
                                                    authorIsNotDeleted,
                                                    isNotDeleted,
                                                    isBanned,
                                                    schema,
                                                    mutable
                                                })
                                                : value;
                                    }
                                }
                            }
                        }
                    }

                    const required = !!(innerSchema.wapplr?.required || innerSchema.required);

                    if (required && filteredRecord[key] == null){

                        const defaultValue =  (typeof innerSchema.wapplr?.default !== "undefined") ? innerSchema.wapplr.default : innerSchema.default;
                        if (typeof defaultValue !== "undefined") {
                            filteredRecord[key] = defaultValue;
                        } else {
                            if (innerSchema.type === "string"){
                                filteredRecord[key] = "";
                            } else if (innerSchema.type === "number"){
                                filteredRecord[key] = 0;
                            } else if (innerSchema.type === "boolean"){
                                filteredRecord[key] = false;
                            } else {
                                filteredRecord[key] = "";
                            }
                        }
                    }

                    await next()

                }

            }

            await next();

        }

        return (Object.keys(filteredRecord).length || typeof record == "object") ? filteredRecord : null;
    }

    async function getOutput(p = {}) {

        const {req, res, args, resolverProperties, response, userBeforeRequest, inputBeforeRequest} = p;

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

        const {editorIsAdmin, editorIsAuthorOrAdmin, authorIsNotDeleted} =
            (sameUser) ?
                inputBeforeRequest :
                await getInput({
                    req,
                    res,
                    args,
                    resolverProperties: {
                        ...resolverProperties,
                        skipInputPost: resolverProperties.noSkipInputPostWhenUserChanged ? false : resolverProperties.skipInputPost
                    }
                });

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
                filteredResponse.record = await filterOutputRecord(
                    req,
                    res,
                    record,
                    editorIsAdmin,
                    editorIsAuthorOrAdmin,
                    authorIsNotDeleted,
                    statusManager.isNotDeleted(filteredResponse.record),
                    statusManager.isBanned(filteredResponse.record)
                );
            } else if (items && items.length) {
                filteredResponse.items = await Promise.all(items.map(async function (post) {
                    post = (post && post.toObject) ? post.toObject() : post;
                    if (post && post._id){
                        const {editorIsAdmin, editorIsAuthorOrAdmin, authorIsNotDeleted} = await getInput({req, res, args, resolverProperties}, post);
                        return await filterOutputRecord(req, res, post, editorIsAdmin, editorIsAuthorOrAdmin, authorIsNotDeleted, post._status_isNotDeleted, post._status_isBanned)
                    }
                    return post;
                }));
            } else if (records && records.length) {
                filteredResponse.records = await Promise.all(records.map(async function (post) {
                    post = (post && post.toObject) ? post.toObject() : post;
                    if (post && post._id){
                        const {editorIsAdmin, editorIsAuthorOrAdmin, authorIsNotDeleted} = await getInput({req, res, args, resolverProperties}, post);
                        return await filterOutputRecord(req, res, post, editorIsAdmin, editorIsAuthorOrAdmin, authorIsNotDeleted, post._status_isNotDeleted, post._status_isBanned)
                    }
                    return post;
                }));
            } else if (responseToObject._id){
                filteredResponse = await filterOutputRecord(req, res, responseToObject, editorIsAdmin, editorIsAuthorOrAdmin, authorIsNotDeleted, statusManager.isNotDeleted(responseToObject), statusManager.isBanned(responseToObject));
            }

        } else if (response && typeof response == "object" && typeof response.length == "number") {

            filteredResponse = await Promise.all(response.map(async function (post) {
                post = (post && post.toObject) ? post.toObject() : post;
                if (post && post._id){
                    const {editorIsAdmin, editorIsAuthorOrAdmin, authorIsNotDeleted} = await getInput({req, res, args, resolverProperties}, post);
                    return await filterOutputRecord(req, res, post, editorIsAdmin, editorIsAuthorOrAdmin, authorIsNotDeleted, post._status_isNotDeleted, post._status_isBanned)
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

            const {extendResolver, cache} = rP;

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

                    if (cache?.get) {
                        const r = cache.get(p);
                        if (r) {
                            return r;
                        }
                    }

                    const {context, args} = p;

                    let savedArgs = args;

                    if (cache?.set) {
                        try {
                            savedArgs = JSON.parse(JSON.stringify(args))
                        } catch (e) {

                        }
                    }

                    const {req, res} = context;

                    const reqUser = req.wappRequest.user;
                    const input = await getInput({req, res, args, resolverProperties: rP});

                    const response = await resolve({...p, input, resolverProperties: rP, defaultResolver});

                    composeValidationError(p, response);

                    const output = await getOutput({req, res, args, resolverProperties: rP, response, userBeforeRequest: reqUser, inputBeforeRequest: input});

                    if (cache?.set) {
                        cache.set({...p, args: savedArgs}, output);
                    }

                    return output;

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

export function mongooseValidationErrorOrNot(e, defaultErrorMessage = "Error") {
    if (e.errors && Object.keys(e.errors).length){
        return {
            error: {
                message:  e.errors[Object.keys(e.errors)[0]]?.message || e.message || defaultErrorMessage,
                errors: Object.keys(e.errors).map((key)=>({path: "record."+e.errors[key].path, message: e.errors[key].message}))
            },
        }
    }

    return {
        error: {message: e.message || defaultErrorMessage},
    }
}

export default function getResolvers(p = {}) {

    const {wapp, name = "post"} = p;

    const n = name;
    const N = capitalize(n);

    const config = (p.config) ? {...p.config} : {};

    if (!wapp.server.graphql){
        wapplrGraphql(p)
    }

    const defaultConstants = getConstants(p);

    const {
        Model,
        statusManager,
        database,
        authorModelName = "User",
        messages = defaultConstants.messages,
        beforeCreateResolvers,
        masterCode = "",
        perPage = {
            limit: 100,
            default: 20
        },
        ...rest
    } = config;

    const authorStatusManager = config.authorStatusManager || statusManager;

    const AuthorModel = database.getModel({modelName: authorModelName});

    const resolvers = {
        new: {
            extendResolver: "createOne",
            skipInputPost: true,
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
                        _id: new mongoose.Types.ObjectId(),
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
                    return mongooseValidationErrorOrNot(e, messages["save"+N+"DefaultFail"])
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
                    return mongooseValidationErrorOrNot(e, messages["save"+N+"DefaultFail"])
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
                    const savedPost = await post.save({validateBeforeSave: false});
                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return mongooseValidationErrorOrNot(e, messages["save"+N+"DefaultFail"])
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
                    const savedPost = await post.save({validateBeforeSave: false});
                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return mongooseValidationErrorOrNot(e, messages["save"+N+"DefaultFail"])
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
                    const savedPost = await post.save({validateBeforeSave: false});
                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return mongooseValidationErrorOrNot(e, messages["save"+N+"DefaultFail"])
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
                    const savedPost = await post.save({validateBeforeSave: false});
                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return mongooseValidationErrorOrNot(e, messages["save"+N+"DefaultFail"])
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
                    const savedPost = await post.save({validateBeforeSave: false});
                    return {
                        record: savedPost,
                    }
                } catch (e){
                    return mongooseValidationErrorOrNot(e, messages["save"+N+"DefaultFail"])
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
        dataLoaderMany: {
            internal: true,
            extendResolver: "dataLoaderMany",
            resolve: async function ({defaultResolver, input, internal, ...p}) {
                if (!internal) {
                    return {message: messages.accessDenied}
                }
                return await defaultResolver.resolve(p);
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
                skipInputPost: true,
                enableFilterAuthor: true,
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

                    const {defaultResolver, input} = p;
                    const {args} = input;
                    const {filter = {}} = args;
                    const {_operators = {}} = filter;

                    const {editorIsAdmin, editorIsAuthor} = input;

                    if (!args.perPage || args.perPage < 1 || (args.perPage > perPage.limit && !editorIsAdmin)){
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

                    if (Object.keys(_operators).length && !filter._operators) {
                        filter._operators = _operators;
                    }

                    const r = await defaultResolver.resolve({...p, args});
                    if (r.pageInfo){
                        r.pageInfo.sort = (Array.isArray(args.sort) && Array.isArray(input.req.body.variables?.sort) && input.req.body.variables.sort.join(",")) || null
                    }
                    return r;
                }
            }

        },
        ...(config.resolvers) ? config.resolvers : {}
    };

    const helpersForResolvers = getHelpersForResolvers({wapp, Model, statusManager, authorStatusManager, messages});

    if (beforeCreateResolvers){
        beforeCreateResolvers(resolvers, {
            ...p,
            name,
            helpersForResolvers,
            config: {
                ...rest,
                Model,
                statusManager,
                authorStatusManager,
                authorModelName,
                database,
                messages,
                beforeCreateResolvers,
                masterCode,
                perPage
            }});
    }

    const {createResolvers} = helpersForResolvers;

    return {resolvers: wapp.server.graphql.addResolversToTC({resolvers: createResolvers(resolvers), TCName: Model.modelName}), helpersForResolvers}

}
