// require("dotenv").config();

import assert from "assert";
import strat_util from "./strat_util";

describe('Strategy Utilities', async function () {

    before('before desc', async function () {




    });

    it("Test Running Jobs", async function () {

        let name = "futuresBid";
        let idx = 6;

        let ru = new strat_util.RunningJobs();
        assert.equal(false, ru.isStarted(name, idx));

        ru.start(name, idx);
        assert.equal(true, ru.isStarted(name, idx));

        ru.done(name, idx);
        assert.equal(false, ru.isStarted(name, idx));



    })



    after(async () => {



    });

});



