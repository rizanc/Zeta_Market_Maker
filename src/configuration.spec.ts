require("dotenv").config();

import assert from "assert";
import {readConfig, loadOptionsForAction, optionsIfc, loadActions} from "./configuration";


describe('Configuration', () => {

  
    before('before desc', async () => {
        // runs once before the first test in this block
        console.log('--before');

        // let result = readConfig('./mm_config.json');
        // assert.ok(result.success, result.msg);
        // console.log(result.config.description);
      

    });

    after(async () => {



    });

    it.skip('display configuration', () => {

        console.log("Configuration here");
        assert.ok(true);
    });

    it('loadOptionsForAction fairAskStrategy', () => {

        console.log("Configuration here");
        let options:optionsIfc = loadOptionsForAction("fairAskStrategy", {"poopy":2});
        console.log(options);
        assert.ok(true);
    });

    it('loadActions', () => {

        let actions:string[] = loadActions();
        console.log(actions);
        assert.ok(true);
    });





});


