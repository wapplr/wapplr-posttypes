import wapplrServer from 'wapplr';
import wapplrMongo, {createMiddleware as createWapplrMongoMiddleware} from "wapplr-mongo";
import wapplrPosttypes, {createPosttypesMiddleware} from "./posttypes";

export default async function createServer(p = {}) {
    const wapp = p.wapp || wapplrServer({...p});
    await wapplrMongo({wapp, p});
    wapplrPosttypes({wapp, ...p});
    return wapp;
}

export function createMiddleware(p = {}) {

    let middlewares = null;

    return async function posttypesMiddleware(req, res, out) {

        if (!middlewares){
            const wapp = p.wapp || await createServer(p);
            middlewares = [
                createWapplrMongoMiddleware({wapp, ...p}),
                createPosttypesMiddleware({wapp, ...p})
            ]
        }

        let index = 0;

        async function next(err) {

            if (middlewares[index]){
                const func = middlewares[index];
                index = index + 1;
                return await func(req, res, (err) ? async function(){await next(err)} : next)
            } else if (typeof out === "function") {
                index = 0;
                return await out(err);
            }

            return null;
        }

        return await next();

    }
}

export async function run(p = {}) {

    const wapp = await createServer(p);

    const globals = wapp.globals;
    const {DEV} = globals;

    const app = wapp.server.app;
    if (typeof DEV !== "undefined" && DEV && module.hot) {
        app.hot = module.hot;
    }

    app.use(createMiddleware({wapp, ...p}));
    wapp.server.listen();

    if (typeof DEV !== "undefined" && DEV && module.hot){
        module.hot.accept("./index");
    }

    return wapp;

}

if (typeof RUN !== "undefined" && RUN === "wapplr-posttypes") {
    run({
        config: {
            globals: {
                DEV: (typeof DEV !== "undefined") ? DEV : undefined,
                WAPP: (typeof WAPP !== "undefined") ? WAPP : undefined,
                RUN: (typeof RUN !== "undefined") ? RUN : undefined,
                TYPE: (typeof TYPE !== "undefined") ? TYPE : undefined,
            }
        }
    });
}
