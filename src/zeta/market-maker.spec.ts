require("dotenv").config();

import {
    constants,
    Decimal,
    Wallet,
    Client,
    Exchange,
    Network,
    utils,
    types,
    events

} from "@zetamarkets/sdk";

import { PublicKey, Connection, Keypair } from "@solana/web3.js";

import {
    HedgerIfc,
    ConfigurationIfc,
    OptionsIfc,
    _getSOLBalance,
    FileConfiguration
} from "../lib";

import {
    getMarketData,
    getFilteredBids,
    getFilteredAsks
} from "./market-maker"

const config: ConfigurationIfc = new FileConfiguration("mm_config.json");

import { KucoinHedger } from "../kucoin/kucoin"
import { findAncestor } from "typescript";

const SLEEP_MS: number = parseInt(process.env.SLEEP_MS) || 25000;
const NETWORK_URL = process.env["network_url"]!;
const PUB_KEY = process.env["pub_key"]!;
const LEDGER_PUB_KEY = process.env["ledger_pub_key"]!;
const PROGRAM_ID = new PublicKey(process.env["program_id"]);

let client;

const userKey = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(Buffer.from(process.env.private_key!).toString()))
);

const wallet = new Wallet(userKey);

const connection: Connection = new Connection(NETWORK_URL, "confirmed");

console.log("Ehllo!");

describe('Market Maker', async function () {


    //await intialize();

    before('before desc', async function () {
        // runs once before the first test in this block

        await Exchange.load(
            PROGRAM_ID,
            Network.MAINNET,
            connection,
            utils.defaultCommitment(),
            new types.DummyWallet(), 100
        );

        client = await Client.load(
            connection,
            wallet,
            utils.defaultCommitment()

        );

        client.pollInterval = 10;
        await client.updateState();
        console.log('--before --');

    });

    it.skip("Should do filter bids", async function () {

        const marketIndex = 4;
        let marketAddress: PublicKey,
            fairMarketPrice: number,
            orderbook: types.DepthOrderbook;

        ({ marketAddress, fairMarketPrice, orderbook } = await getMarketData(marketIndex));


        let filteredBids =
            await getFilteredBids(marketIndex, client.orders, orderbook);

        console.log("Filtered Bids");
        console.log(filteredBids);
    })

    it("Should do filter asks", async function () {

        const marketIndex = 4;
        let marketAddress: PublicKey,
            fairMarketPrice: number,
            orderbook: types.DepthOrderbook;

        ({ marketAddress, fairMarketPrice, orderbook } = await getMarketData(marketIndex));

        let filteredAsks = 
            await getFilteredAsks(marketIndex, client.orders, orderbook);

        console.log("Filtered Asks");
        console.log(filteredAsks); 
    })

    after(async () => {

        // Close exchange object.
        await Exchange.close();

        // Close client object.
        await client.close();
        console.log('End');

    });

});



