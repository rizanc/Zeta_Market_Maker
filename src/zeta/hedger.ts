require("dotenv").config();

import { watchFile } from 'fs';

import {
    Wallet,
    Client,
    Exchange,
    Network,
    utils,
    types,

} from "@zetamarkets/sdk";

import { PublicKey, Connection, Keypair } from "@solana/web3.js";

import {
    HedgerIfc,
    ConfigurationIfc,
    _getSOLBalance,
    FileConfiguration,
} from "../lib";

import {
    shortPositionsDelta,
} from "./strategies";

import { KucoinHedger } from "../kucoin/kucoin";
const kucoinHedger: HedgerIfc = new KucoinHedger();

const config: ConfigurationIfc = new FileConfiguration("mm_config.json");

let loopStatus = {
    lastRun: new Date(),
    runImmediate: true,
    running: false
}

const SLEEP_MS: number = parseInt(process.env.SLEEP_MS) || 25000;
const NETWORK_URL = process.env["network_url"]!;
const PROGRAM_ID = new PublicKey(process.env["program_id"]);

const RUNNABLE_ACTIONS = {
    "shortPositionsDelta": shortPositionsDelta,
};

let client: Client;

async function runHedger() {

    console.log("Market Maker Starting");

    watchFile("mm_config.json", async (curr, prev) => {

        if (client) {
            loopStatus.runImmediate = true;
        }

        console.log(`Config file Changed ${prev.mtime} on ${curr.mtime}`);

    });

    const userKey = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(Buffer.from(process.env.private_key!).toString()))
    );

    const wallet = new Wallet(userKey);
    const connection: Connection = new Connection(NETWORK_URL, "confirmed");

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

    client.pollInterval = 10;

    await client.updateState();
    utils.displayState();

    loopStatus.lastRun = new Date();

    setInterval(async () => {
        let { runImmediate, running, lastRun } = loopStatus;
        let _now = new Date();
        if (!running) {
            if (runImmediate || (_now.getTime() - lastRun.getTime() > SLEEP_MS)) {
                running = loopStatus.running = true;
                await actionsLoop();

                runImmediate = false;
                running = false;
                lastRun = new Date();

                loopStatus = { runImmediate, running, lastRun };
            }
        }
    }, 200);
}

async function actionsLoop() {

    console.log(`${new Date().toLocaleTimeString('en-US')} Actions Starting`);

    await client.updateState();

    let oraclePrice: number = Exchange.oracle.getPrice("SOL/USD").price;
    oraclePrice = Exchange.oracle.getPrice("SOL/USD").price;

    let marginAccountState = Exchange.riskCalculator.getMarginAccountState(
        client.marginAccount
    );

    let actions: any[] = config.loadHedger().filter((a: any) => a.status === "active");

    let ra = [];
    for (let i = 0; i < actions.length; i++) {
        ra.push(RUNNABLE_ACTIONS[actions[i].name](
            client, marginAccountState, actions[i].options, kucoinHedger));
    }

    await Promise.all(
        ra
    );

    console.log(`\n===\n${new Date().toLocaleTimeString('en-US')} Actions Finished\n===\n`);

}

export default {
    run: runHedger,
}

