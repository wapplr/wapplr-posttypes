import {defaultDescriptor} from "../common/utils";
import initDatabase from "./initDatabase";
import getModel from "./getModel";
import getResolvers from "./getResolvers";
import getStatusManager from "../common/getStatusManager";
import getConstants from "./getConstants";

function getDefaultPostTypesManager(p = {}) {

    const {wapp} = p;

    async function defaultAddPostType(p = {}) {

        const {name = "post", config = {}} = p;

        const defaultConstants = getConstants(p);

        const {
            authorModelName =  "User",
            messages = defaultConstants.messages,
            labels = defaultConstants.labels,
            perPage = {
                limit: 100,
                default: 20
            },
        } = config;

        const statusManager = config.statusManager || getStatusManager({config});
        const authorStatusManager = config.authorStatusManager || statusManager;
        const database = await initDatabase({wapp, name, config});

        const configWithDefaults = {...config, authorModelName, messages, labels, perPage, statusManager, authorStatusManager, database};

        const Model = getModel({wapp, name, config: configWithDefaults});
        const {resolvers, helpersForResolvers} = getResolvers({wapp, name, config: {...configWithDefaults, Model}});

        const defaultPostTypeObject = Object.create(Object.prototype, {
            database: {
                ...defaultDescriptor,
                writable: false,
                value: database
            },
            statusManager: {
                ...defaultDescriptor,
                value: statusManager
            },
            authorStatusManager: {
                ...defaultDescriptor,
                value: authorStatusManager
            },
            authorModelName: {
                ...defaultDescriptor,
                value: authorModelName
            },
            Model: {
                ...defaultDescriptor,
                value: Model
            },
            resolvers: {
                ...defaultDescriptor,
                value: resolvers
            },
            helpersForResolvers: {
                ...defaultDescriptor,
                value: helpersForResolvers
            },
            constants: {
                ...defaultDescriptor,
                value: {
                    messages,
                    labels
                }
            },
            perPage: {
                ...defaultDescriptor,
                value: perPage
            },
        });

        Object.defineProperty(postTypesManager.postTypes, name, {
            ...defaultDescriptor,
            writable: false,
            value: defaultPostTypeObject
        });

        return postTypesManager.postTypes[name];

    }

    async function defaultGetPostType({name, addIfThereIsNot, ...rest}) {
        const postType = postTypesManager.postTypes[name];
        if (postType || !addIfThereIsNot){
            return postType;
        }
        return await postTypesManager.addPostType({name, ...rest});
    }

    function defaultFindPostType({name}) {
        return postTypesManager.postTypes[name];
    }

    const postTypesManager = Object.create(Object.prototype, {
        addPostType: {
            ...defaultDescriptor,
            value: defaultAddPostType
        },
        getPostType: {
            ...defaultDescriptor,
            value: defaultGetPostType
        },
        findPostType: {
            ...defaultDescriptor,
            value: defaultFindPostType
        },
        postTypes: {
            ...defaultDescriptor,
            value: {}
        }
    });

    return postTypesManager;

}

export default function initPostTypes(p = {}) {
    const {wapp} = p;
    const {server} = wapp;

    if (!server.postTypes){

        const {postTypesManager = getDefaultPostTypesManager(p)} = p;
        Object.defineProperty(server, "postTypes", {
            ...defaultDescriptor,
            value: postTypesManager
        });

        Object.defineProperty(server.postTypes, "wapp", {...defaultDescriptor, writable: false, enumerable: false, value: wapp});

    }

    return server.postTypes;
}
