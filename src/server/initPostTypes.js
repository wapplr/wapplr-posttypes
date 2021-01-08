import {defaultDescriptor} from "./utils";
import initDatabase from "./initDatabase";
import getModel from "./getModel";

function getDefaultPostTypesManager(p = {}) {

    async function defaultAddPostType() {

        const args = arguments[0] || {};
        const {name = "post"} = args;

        const defaultPostTypeObject = Object.create(Object.prototype, {
            database: {
                ...defaultDescriptor,
                writable: false,
                value: await initDatabase({...p, ...args})
            },
            Model: {
                ...defaultDescriptor,
                value: await getModel({...p, ...args})
            }
        })

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

    const postTypesManager = Object.create(Object.prototype, {
        addPostType: {
            ...defaultDescriptor,
            value: defaultAddPostType
        },
        getPostType: {
            ...defaultDescriptor,
            value: defaultGetPostType
        },
        postTypes: {
            ...defaultDescriptor,
            value: {}
        }
    })

    return postTypesManager;

}

export default function initPostTypes(p = {}) {
    const {wapp} = p;
    if (!wapp.server.postTypes){
        const {postTypesManager = getDefaultPostTypesManager(p)} = p;
        Object.defineProperty(wapp.server, "postTypes", {
            ...defaultDescriptor,
            value: postTypesManager
        })
    }
    return wapp.server.postTypes;
}
