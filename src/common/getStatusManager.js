import {defaultDescriptor} from "./utils";

export default function createStatusManager(p = {}) {

    const {config = {}} = p;

    const {
        statuses = {
            featured: 120,
            approved: 100,
            requiredData: 50,
            created: 40,
            deleted: 30,
            banned: 20
        },
        statusField = "_status",
        requiredDataForStatus = {},
    } = config;

    //internal functions

    function recursiveDataTypeValidate(p = {}) {

        let {data, required} = p;
        data = (data && data.toObject) ? data.toObject() : data

        let valid = true;
        Object.keys(required).forEach(function(key) {
            if (required[key] && typeof required[key] === "object" && typeof required[key].type == "undefined" && typeof required[key].value == "undefined"){
                if (data[key] && typeof data[key] === "object") {
                    valid = recursiveDataTypeValidate({data: data[key], required: required[key]})
                } else {
                    valid = false;
                }
            } else {
                if (required[key]) {
                    if (
                        (typeof required[key].type == "function" &&
                            required[key].type.name &&
                            required[key].type.name.toLowerCase() !== typeof data[key])
                        ||
                        (typeof required[key].type == "function" &&
                            required[key].type.name &&
                            required[key].type.name.toLowerCase() === "string" && data[key] === "") ||
                        (typeof required[key].value !== "undefined" &&
                            typeof required[key].value !== typeof data[key])
                        ||
                        (typeof required[key].value !== "undefined" &&
                            required[key].value !== data[key])
                    ) {
                        valid = false;
                    }
                }
            }
        });
        return valid;
    }

    function dynamicStatus({requiredData}) {
        let newStatus;
        if (requiredData) {
            newStatus = statusManager.statuses["requiredData"];
        } else {
            newStatus = statusManager.statuses["created"];
        }
        return newStatus;
    }

    //exports

    function setNewStatus(doc) {
        const currentStatus = (doc[statusField] && !isNaN(Number(doc[statusField])) ) ? Number(doc[statusField]) : 0;
        let newStatus = currentStatus || statusManager.statuses["created"];
        if (currentStatus > (statusManager.statuses["created"]-1)) {
            const requiredData = recursiveDataTypeValidate({data:doc, required:statusManager.requiredDataForStatus});
            newStatus = dynamicStatus({requiredData});
        }
        doc[statusField] = newStatus;
        return newStatus;
    }

    function setRestoreStatusByAdmin(doc) {
        const currentStatus = (doc[statusField] && !isNaN(Number(doc[statusField])) ) ? Number(doc[statusField]) : 0;
        let newStatus = currentStatus || statusManager.statuses["created"];
        if (currentStatus < statusManager.statuses["deleted"]) {
            const requiredData = recursiveDataTypeValidate({data:doc, required:statusManager.requiredDataForStatus});
            newStatus = dynamicStatus({requiredData});
        }
        doc[statusField] = newStatus;
        return newStatus;
    }

    function setRestoreStatusByAuthor(doc) {
        const currentStatus = (doc[statusField] && !isNaN(Number(doc[statusField])) ) ? Number(doc[statusField]) : 0;
        let newStatus = currentStatus || statusManager.statuses["deleted"];

        if (currentStatus === statusManager.statuses["deleted"] ) {
            const requiredData = recursiveDataTypeValidate({data:doc, required:statusManager.requiredDataForStatus});
            newStatus = dynamicStatus({requiredData});
        }

        doc[statusField] = newStatus;
        return newStatus;
    }

    function setDeletedStatus(doc) {
        const currentStatus = (doc[statusField] && !isNaN(Number(doc[statusField])) ) ? Number(doc[statusField]) : 0;
        let newStatus = currentStatus || statusManager.statuses["deleted"];
        const featuredStatus = getFeaturedStatus();
        if (currentStatus > statusManager.statuses["deleted"] && currentStatus < featuredStatus) {
            newStatus = statusManager.statuses["deleted"];
        }
        doc[statusField] = newStatus;
        return newStatus;
    }

    function setBanStatus(doc) {
        const currentStatus = (doc[statusField] && !isNaN(Number(doc[statusField])) ) ? Number(doc[statusField]) : 0;
        let newStatus = currentStatus || statusManager.statuses["created"];
        const featuredStatus = getFeaturedStatus();
        if (currentStatus > statusManager.statuses["banned"] && currentStatus < featuredStatus) {
            newStatus = statusManager.statuses["banned"];
        }
        doc[statusField] = newStatus;
        return newStatus;
    }

    function setApproveStatus(doc) {
        const {getMinStatus} = statusManager;
        const currentStatus = (doc[statusField] && !isNaN(Number(doc[statusField])) ) ? Number(doc[statusField]) : 0;
        let newStatus = currentStatus || statusManager.statuses["created"];
        const minEnableApproveStatus = getMinStatus();
        const maxEnableApproveStatus = getFeaturedStatus();
        if (currentStatus > minEnableApproveStatus-1 && currentStatus < maxEnableApproveStatus) {
            newStatus = statusManager.statuses["approved"];
        }
        doc[statusField] = newStatus;
        return newStatus;
    }

    function setFeaturedStatus(doc) {
        const {getMinStatus} = statusManager;
        const currentStatus = (doc[statusField] && !isNaN(Number(doc[statusField])) ) ? Number(doc[statusField]) : 0;
        let newStatus = currentStatus || statusManager.statuses["created"];
        const minEnableFeaturedStatus = getMinStatus();
        if (currentStatus > minEnableFeaturedStatus-1) {
            newStatus = statusManager.statuses["featured"];
        }
        doc[statusField] = newStatus;
        return newStatus;
    }

    function removeFeaturedStatus(doc) {
        const currentStatus = (doc[statusField] && !isNaN(Number(doc[statusField])) ) ? Number(doc[statusField]) : 0;
        let newStatus = currentStatus || statusManager.statuses["created"];
        if (currentStatus === getFeaturedStatus()) {
            newStatus = statusManager.statuses["approved"];
        }
        doc[statusField] = newStatus;
        return newStatus;
    }


    function isFeatured(doc) {
        if (doc && doc._id) {
            const currentStatus = (doc[statusField] && !isNaN(Number(doc[statusField])) ) ? Number(doc[statusField]) : 0;
            if (currentStatus >= statusManager.statuses["featured"]) {
                return true;
            }
        }
        return false;
    }

    function isApproved(doc) {
        if (doc && doc._id) {
            const currentStatus = (doc[statusField] && !isNaN(Number(doc[statusField])) ) ? Number(doc[statusField]) : 0;
            if (currentStatus >= statusManager.statuses["approved"]) {
                return true;
            }
        }
        return false;
    }

    function isDeleted(doc){
        if (doc && doc._id) {
            const currentStatus = (doc[statusField] && !isNaN(Number(doc[statusField])) ) ? Number(doc[statusField]) : 0;
            if (currentStatus === statusManager.statuses["deleted"]) {
                return true;
            }
        }
        return false;
    }

    function isBanned(doc){
        if (doc && doc._id) {
            const currentStatus = (doc[statusField] && !isNaN(Number(doc[statusField])) ) ? Number(doc[statusField]) : 0;
            if (currentStatus < statusManager.statuses["deleted"]) {
                return true;
            }
        }
        return false;
    }

    function isNotDeleted(doc){
        if (doc && doc._id) {
            const currentStatus = (doc[statusField] && !isNaN(Number(doc[statusField])) ) ? Number(doc[statusField]) : 0;
            if (currentStatus >= statusManager.statuses["created"]) {
                return true;
            }
        }
        return false;
    }

    function isValidated(doc){
        if (doc && doc._id) {
            const currentStatus = (doc[statusField] && !isNaN(Number(doc[statusField])) ) ? Number(doc[statusField]) : 0;
            if (currentStatus >= statusManager.statuses["requiredData"]) {
                return true;
            }
        }
        return false;
    }



    function getDefaultStatus() {
        return statusManager.statuses["created"];
    }
    function getMinStatus() {
        return  statusManager.statuses["requiredData"];
    }
    function getFeaturedStatus() {
        return statusManager.statuses["featured"];
    }

    const statusManager = Object.create(Object.prototype, {

        statuses: {
            ...defaultDescriptor,
            enumerable: false,
            value: statuses
        },
        statusField: {
            ...defaultDescriptor,
            enumerable: false,
            value: statusField
        },
        requiredDataForStatus: {
            ...defaultDescriptor,
            enumerable: false,
            value: requiredDataForStatus
        },

        setNewStatus: {
            ...defaultDescriptor,
            value: setNewStatus
        },
        setRestoreStatusByAdmin: {
            ...defaultDescriptor,
            value: setRestoreStatusByAdmin
        },
        setRestoreStatusByAuthor: {
            ...defaultDescriptor,
            value: setRestoreStatusByAuthor
        },
        setDeletedStatus: {
            ...defaultDescriptor,
            value: setDeletedStatus
        },
        setBanStatus: {
            ...defaultDescriptor,
            value: setBanStatus
        },
        setApproveStatus: {
            ...defaultDescriptor,
            value: setApproveStatus
        },
        setFeaturedStatus: {
            ...defaultDescriptor,
            value: setFeaturedStatus
        },
        removeFeaturedStatus: {
            ...defaultDescriptor,
            value: removeFeaturedStatus
        },

        isFeatured: {
            ...defaultDescriptor,
            value: isFeatured
        },
        isApproved: {
            ...defaultDescriptor,
            value: isApproved
        },
        isNotDeleted: {
            ...defaultDescriptor,
            value: isNotDeleted
        },
        isValidated: {
            ...defaultDescriptor,
            value: isValidated
        },
        isDeleted: {
            ...defaultDescriptor,
            value: isDeleted
        },
        isBanned: {
            ...defaultDescriptor,
            value: isBanned
        },

        getDefaultStatus: {
            ...defaultDescriptor,
            value: getDefaultStatus
        },
        getMinStatus: {
            ...defaultDescriptor,
            value: getMinStatus
        },
        getFeaturedStatus: {
            ...defaultDescriptor,
            value: getFeaturedStatus
        }
    })

    return statusManager

}
