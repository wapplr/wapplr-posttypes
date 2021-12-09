import {capitalize} from "../common/utils";

export default function getConstants(p = {}) {

    const {name = "post"} = p;
    const n = name;
    const ns = (n.endsWith("y")) ? n.slice(-1)+"ies" : n+"s";
    const N = capitalize(n);

    const messages = {
        ["save"+N+"DefaultFail"]: "Sorry, there was an issue save the "+n+", please try again",
        invalidData: "Invalid data",
        missingData: "Missing data",
        lowStatusLevel: "Your status level is too low to perform the operation",
        [n+"NotFound"]: N + " not found",
        accessDenied: "You do not have permission to perform that operation"
    };

    const labels = {
        [ns+"Sort_CREATEDDATE_ASC"]: "Oldest to the top",
        [ns+"Sort_CREATEDDATE_DESC"]: "Latest to the top",
        [n+"StatusLabel"]: "Status",
        [n+"CreatedDateLabel"]: "Created date",
    };

    return {messages, labels}

}
