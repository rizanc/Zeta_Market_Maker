// require("dotenv").config();

import {runWebSocketServer} from "./ws";

describe('Market Maker', async function () {

    //await intialize();

    before('before desc', async function () {
        // runs once before the first test in this block

        await runWebSocketServer()

    });

    it("Should Start Web Socket Server", async function () {


    })



    after(async () => {



    });

});



