import {defaultDescriptor} from "../common/utils";
import getStatusManager from "../common/getStatusManager";

function getDefaultPostTypesManager(p = {}) {

    const {wapp} = p;

    function defaultAddPostType(p = {}) {

        const {name = "post", ...rest} = p;
        const statusManager = rest.statusManager || getStatusManager({wapp, name, ...rest});

        const defaultPostTypeObject = Object.create(Object.prototype, {
            statusManager: {
                ...defaultDescriptor,
                value: statusManager
            },
            subscribeUpdateFindById: {
                ...defaultDescriptor,
                value: function subscribeUpdateFindById() {

                    if (wapp.states) {
                        const statesHandleName = "subscribeUpdate" + name.slice(0, 1).toUpperCase() + name.slice(1)+"FindById";

                        wapp.states.addHandle({
                            [statesHandleName]: function (req, res, next) {

                                const wappResponse = res.wappResponse;

                                if (postTypesManager.postTypes[name].unsubscribeUpdateFindById){
                                    postTypesManager.postTypes[name].unsubscribeUpdateFindById();
                                }

                                const unsubscribe = wappResponse.store.subscribe(function (state, {type, payload}) {

                                    if (type === "INS_RES" && payload.name === "responses"){

                                        const keys = [name+"New", name+"Save", name+"Delete", name+"Approve", name+"Featured", name+"RemoveFeatured", name+"Ban"];
                                        const response = payload.value;
                                        let foundEnabledKeys = false;
                                        const stateBeforeUpdate = wappResponse.store.getState();
                                        const findByIdBeforeUpdate = stateBeforeUpdate.res.responses && stateBeforeUpdate.res.responses[name+"FindById"];

                                        if (findByIdBeforeUpdate?._id){

                                            keys.forEach(function (requestName) {
                                                if (!foundEnabledKeys && response && response[requestName]){
                                                    foundEnabledKeys = true;

                                                    if (typeof response[requestName].record !== "undefined" && !response[requestName].error){

                                                        const newId = response[requestName].record?._id;
                                                        if (newId === findByIdBeforeUpdate._id){
                                                            wappResponse.store.dispatch(wapp.states.stateManager.actions.res({
                                                                type: "INS_RES",
                                                                name: "responses",
                                                                value: {[name+"FindById"]: response[requestName].record}
                                                            }));
                                                            wappResponse.state = wappResponse.store.getState();
                                                        }

                                                    }
                                                }
                                            })

                                        }

                                    }
                                });

                                postTypesManager.postTypes[name].unsubscribeUpdateFindById = function() {
                                    unsubscribe();
                                    postTypesManager.postTypes[name].unsubscribeUpdateFindById = null;
                                };

                                next();

                            }
                        })
                    }
                }
            },
            unsubscribeUpdateFindById: {
                ...defaultDescriptor,
                value: null
            },
        });

        Object.defineProperty(postTypesManager.postTypes, name, {
            ...defaultDescriptor,
            writable: false,
            value: defaultPostTypeObject
        });

        postTypesManager.postTypes[name].subscribeUpdateFindById();

        return postTypesManager.postTypes[name];

    }

    function defaultGetPostType({name, addIfThereIsNot, ...rest}) {
        const postType = postTypesManager.postTypes[name];
        if (postType || !addIfThereIsNot){
            return postType;
        }
        return postTypesManager.addPostType({name, ...rest});
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
    });

    return postTypesManager;

}

export default function initPostTypes(p = {}) {
    const {wapp} = p;
    const {client} = wapp;

    if (!client.postTypes){

        const {postTypesManager = getDefaultPostTypesManager(p)} = p;
        Object.defineProperty(client, "postTypes", {
            ...defaultDescriptor,
            value: postTypesManager
        });

        Object.defineProperty(client.postTypes, "wapp", {...defaultDescriptor, writable: false, enumerable: false, value: wapp});

    }

    return client.postTypes;
}
