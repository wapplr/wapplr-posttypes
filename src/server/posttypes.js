import {defaultDescriptor, mergeProperties} from "./utils";
import initDatabase from "./initDatabase";
import getModel from "./getModel";

function getDefaultPosttypesManager(p = {}) {

    async function defaultAddPosttype() {

        const args = arguments[0] || {};
        const {name = "Model"} = args;

        const defaultPosttypeObject = Object.create(Object.prototype, {
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

        Object.defineProperty(posttypesManager.posttypes, name, {
            ...defaultDescriptor,
            writable: false,
            value: defaultPosttypeObject
        });

        return posttypesManager.posttypes[name];

    }

    async function defaultGetPosttype({name, addIfThereIsNot, ...rest}) {
        const posttype = posttypesManager.posttypes[name];
        if (posttype || !addIfThereIsNot){
            return posttype;
        }
        return await posttypesManager.addPosttype({name, ...rest});
    }

    const posttypesManager = Object.create(Object.prototype, {
        addPosttype: {
            ...defaultDescriptor,
            value: defaultAddPosttype
        },
        getPosttype: {
            ...defaultDescriptor,
            value: defaultGetPosttype
        },
        posttypes: {
            ...defaultDescriptor,
            value: {}
        }
    })

    return posttypesManager;

}

export default function posttypes(p = {}) {
    const {wapp} = p;
    if (!wapp.server.posttypes){
        const {posttypesManager = getDefaultPosttypesManager(p)} = p;
        Object.defineProperty(wapp.server, "posttypes", {
            ...defaultDescriptor,
            value: posttypesManager
        })
    }
    return wapp.server.posttypes;
}

export function createPosttypesMiddleware(p = {}) {

    const {wapp} = p;

    function defaultHandle(req, res, next) {
        const posttypesManager = posttypes(p)
        if (!posttypesMiddleware.posttypesManager){
            Object.defineProperty(posttypesMiddleware, "posttypesManager", {
                ...defaultDescriptor,
                value: posttypesManager
            })
        }
        next();
    }

    const posttypesMiddlewareProperties = Object.create(Object.prototype, {
        handle: {
            ...defaultDescriptor,
            value: defaultHandle
        }
    })

    function posttypesMiddleware(req, res, next) {
        if (typeof posttypesMiddleware.handle === "function"){
            posttypesMiddleware.handle(req, res, next);
        }
        return posttypesMiddleware;
    }

    mergeProperties(posttypesMiddleware, posttypesMiddlewareProperties);

    Object.defineProperty(posttypesMiddleware, "wapp", {...defaultDescriptor, writable: false, enumerable: false, value: wapp});

    return posttypesMiddleware;

}
