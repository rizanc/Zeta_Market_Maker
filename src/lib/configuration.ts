import fs from "fs";
import {
    ConfigurationIfc,
    OptionsIfc
  } from "./library";


export class FileConfiguration implements ConfigurationIfc {

    private filename: string;

    public constructor(_filename: string) {
        this.filename = _filename;

    }

    public loadActions(): string[] {

        let config = JSON.parse(fs.readFileSync(this.filename, "utf8",));
        let actions = config.actions;
        return actions;

    }

    public loadHedger(): string[] {

        let config = JSON.parse(fs.readFileSync(this.filename, "utf8",));
        let hedger = config.hedger;
        return hedger;

    }

    public loadSnipers(): string[] {

        let config = JSON.parse(fs.readFileSync(this.filename, "utf8",));
        let snipers = config.snipers;
        return snipers;

    }

    public loadOptionsForAction(actionName: String, defaultOptions: Object): OptionsIfc {
        let result = {
            success: true,
            config: null,
            msg: ""
        }

        try {
            result.config = JSON.parse(fs.readFileSync(this.filename, "utf8",));

        } catch (err) {

            result.success = false;
            result.msg = err.message;

        }
        let options: OptionsIfc = result.config.actions.filter(a => a.name == actionName)[0].options;
        return { ...defaultOptions, ...options };
    }
}



