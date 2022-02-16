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

} from "@zetamarkets/sdk";

import { PublicKey, Connection, Keypair } from "@solana/web3.js";

import {
    getIndexForPrice,
    Hedger
} from "./lib";

import { fairBidStrategy } from "./market-maker";

import { KucoinHedger } from "../kucoin/kucoin"

const SLEEP_MS: number = parseInt(process.env.SLEEP_MS) || 1000;
const FAIR_MARKET_PRICE_SPREAD: number = parseFloat(process.env["FAIR_MARKET_PRICE_SPREAD"]) || 0.01;
const NETWORK_URL = process.env["network_url"]!;
const PROGRAM_ID = new PublicKey(process.env["program_id"]);
let processingAskOrders = new Array<boolean>(250);
let processingBidOrders = new Array<boolean>(250);

const hedger: Hedger = new KucoinHedger();

describe.skip('Market Maker', () => {

    const userKey = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(Buffer.from(process.env.private_key!).toString()))
    );
    const wallet = new Wallet(userKey);
    const connection: Connection = new Connection(NETWORK_URL, "confirmed");
    let client;

    before('before desc', async () => {
        // runs once before the first test in this block
        console.log('--before');

        await Exchange.load(
            PROGRAM_ID,
            Network.MAINNET,
            connection,
            utils.defaultCommitment(),
            new types.DummyWallet(), 100,

        );

        client = await Client.load(
            connection,
            wallet,
            utils.defaultCommitment()

        );

        await client.updateState();

    });

    after(async () => {

        await client.close();
        await Exchange.close();

    });

    it.skip('should display state', async () => {

        await client.updateState();
        utils.displayState();

    });

    it('should place a bid', async () => {
        await fairBidStrategy(client, 30, null);
    });


});


