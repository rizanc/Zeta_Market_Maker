require("dotenv").config();

import assert from 'assert';
import { getSOLBalance, _getSOLBalance } from "../lib";

const PUB_KEY = process.env.pub_key;
const LEDGER_PUB_KEY = process.env.ledger_pub_key;

describe('Utils', () => {


    before('before desc', async () => {
        // runs once before the first test in this block
        console.log('--before');

    });

    it.skip('getBalance', async () => {

        let balance = await getSOLBalance(PUB_KEY);

        assert.ok(balance > 0, "Balance is lower than 0 =>" + balance);

    });

    it('getBalance_array', async () => {

        let balance = await _getSOLBalance([PUB_KEY,LEDGER_PUB_KEY]);

        console.log(`Balance ${balance}`);
        assert.ok(balance > 0, "Balance is lower than 0 =>" + balance);

    });

    after(async () => {

    });

});


