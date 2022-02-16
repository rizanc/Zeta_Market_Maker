import fs from "fs";

export interface optionsIfc {
    marketIndex: number,
    crossMkt: boolean,
    fairMarketPriceSpread: number,
    size: number,
    minAvailableBalanceForOrder: number,
    minPrice: number,
    maxPrice: number
}

export function loadActions(): string[] {

    let config = JSON.parse(fs.readFileSync("mm_config.json", "utf8",));
    let actions = config.actions;
    return actions;

}

export function loadOptionsForAction(actionName: String, defaultOptions: Object): optionsIfc {
    let result = {
        success: true,
        config: null,
        msg: ""
    }

    try {
        result.config = JSON.parse(fs.readFileSync("mm_config.json", "utf8",));

    } catch (err) {

        result.success = false;
        result.msg = err.message;

    }
    let options: optionsIfc = result.config.actions.filter(a => a.name == actionName)[0].options;
    return { ...defaultOptions, ...options };
}

export function readConfig(path): any {

    let result = {
        success: true,
        config: null,
        msg: ""
    }

    try {
        result.config = JSON.parse(fs.readFileSync(path, "utf8",));
    } catch (err) {

        result.success = false;
        result.msg = err.message;

    }

    return result;
}
