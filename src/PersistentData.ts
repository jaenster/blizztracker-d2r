import * as fs from "fs";
import {Observer} from 'micro-observer';

function mergeObjectsDeep<T>(target: Partial<T>, source: Readonly<Partial<T>>, depth: number = 50): Partial<T> {
    if (!depth) {// Anti recursion
        return target;
    }
    Object.keys(source).forEach(key => {
        switch (true) {
            case !target.hasOwnProperty(key):
                break;

            // Append on an array
            // target has to be an array if its defined and of the same type
            case Array.isArray(target[key]):
                return target[key].push(...source[key]);

            // recursively merge objects
            case typeof target[key] === "object" && /*not null*/ target[key]:
                return mergeObjectsDeep(target[key], source[key], depth--);
        }
        // not an complex type, or not on the target yet
        target[key] = source[key];
    });
    return target;
}


export function persist<T>(data: Partial<T>, filename: string): T {
    try {
        const blob = fs.readFileSync(filename);
        mergeObjectsDeep(data, JSON.parse(blob.toString()));
    } catch (e) {

    }


    let timer;
    return Observer.create(data, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            // noinspection JSIgnoredPromiseFromCall
            fs.promises.writeFile(filename, JSON.stringify(data));
        });
        return true; // allow the change
    });

}