require("dotenv").config();

import { watchFile } from 'fs';

import {
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
  _getSOLBalance,
  FileConfiguration,
} from "../lib";

import {
  shortPositionsDelta,
  callBidStrategy,
  callOfferStrategy,
  callBidSniper
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
  "callBidStrategy": callBidStrategy,
  "callOfferStrategy": callOfferStrategy,
  "callBidSniper": callBidSniper
};

let client;

async function runMarketMaker() {

  console.log("Market Maker Starting");

  watchFile("mm_config.json", async (curr, prev) => {

    if (client) {
      loopStatus.runImmediate = true;
    }

    await sniperInitialize();

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
    async (event: events.EventType, data: any) => {

      switch (event) {
        case events.EventType.ORDERBOOK:
          let marketIndex = data.marketIndex;
          let markets = Exchange.markets;
          let market = markets.markets[4];
          let orderbook = market.orderbook;
          console.log("======= ORDERBOOK ==========")
          console.log(orderbook);

          const configuration: ConfigurationIfc = new FileConfiguration("mm_config.json");
          let snipers: any[] = configuration.loadSnipers()
            .filter((a: any) => a["status"] === "active" && a.options.marketIndex === marketIndex);

          let marginAccountState = Exchange.riskCalculator.getMarginAccountState(
            client.marginAccount
          );

          await runSniperActions(snipers, marginAccountState);
          console.log(".=================")

        default:
          return;
      }
    }

  );

  client = await Client.load(
    connection,
    wallet,
    utils.defaultCommitment()

  );

  client.pollInterval = 10;


  await client.updateState();
  utils.displayState();

  await sniperInitialize();

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

async function runSniperActions(snipers: any[], marginAccountState: types.MarginAccountState) {
  let sniperActions = [];
  for (let i = 0; i < snipers.length; i++) {
    sniperActions.push(RUNNABLE_ACTIONS[snipers[i].name](
      client, marginAccountState, snipers[i].options));
  }
  await Promise.all(
    sniperActions
  );
}

async function sniperInitialize() {

  let snipers: any[] = config.loadSnipers()

  let marginAccountState = Exchange.riskCalculator.getMarginAccountState(
    client.marginAccount
  );

  await runSniperActions(snipers.filter(a => a.status == "active"), marginAccountState);

  for (let i = 0; i < snipers.length; i++) {

    switch (snipers[i].status) {
      case "active":
        // Subscribe to a market index.
        Exchange.markets.unsubscribeMarket(snipers[i].options.marketIndex);
        Exchange.markets.subscribeMarket(snipers[i].options.marketIndex);
        Exchange.markets.pollInterval = snipers[i].options.minSleepSeconds;
        break;
      default:
        Exchange.markets.unsubscribeMarket(snipers[i].options.marketIndex);
        break;

    }

  }

}

async function actionsLoop() {

  console.log(`${new Date().toLocaleTimeString('en-US')} Actions Starting`);

  let oraclePrice: number = Exchange.oracle.getPrice("SOL/USD").price;
  console.log(`Oracle Price: ${oraclePrice}`);

  await client.updateState();

  oraclePrice = Exchange.oracle.getPrice("SOL/USD").price;

  let marginAccountState = Exchange.riskCalculator.getMarginAccountState(
    client.marginAccount
  );

  let actions: any[] = config.loadActions().filter((a: any) => a.status === "active");

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

function toPrec(x: number, precision: number): number {
  return parseFloat(x.toFixed(precision));
}


export default {
  run: runMarketMaker,

}