require("dotenv").config();

import { watchFile } from 'fs';

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
  OptionsIfc
} from "../lib";


import { FileConfiguration } from '../configuration';
const config: ConfigurationIfc = new FileConfiguration("mm_config.json");

import { KucoinHedger } from "../kucoin/kucoin"
const kucoinHedger: HedgerIfc = new KucoinHedger();

const SLEEP_MS: number = parseInt(process.env.SLEEP_MS) || 25000;
const NETWORK_URL = process.env["network_url"]!;
const PROGRAM_ID = new PublicKey(process.env["program_id"]);

let processingAskOrders = new Array<boolean>(250);
let processingBidOrders = new Array<boolean>(250);

const RUNNABLE_ACTIONS = {
  "shortPositionsDelta": shortPositionsDelta,
  "fairBidStrategy": fairBidStrategy,
  "fairAskStrategy": fairAskStrategy,
  "bidSniper": bidSniper
};

let client;

async function runMarketMaker() {

  console.log("Market Maker Starting");


  watchFile("mm_config.json", async (curr, prev) => {

    if (client) {
      await actionsLoop();
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
          console.log("=================")
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
  await actionsLoop();

  setInterval(async () => {
    await actionsLoop();
  }, SLEEP_MS);

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
      client, marginAccountState, actions[i].options));
  }

  await Promise.all(
    ra
  );

  console.log(`${new Date().toLocaleTimeString('en-US')} Actions Finished`);

}

async function bidSniper(
  client: Client,
  marginAccountState: any,
  _options: any
) {

  let defaultOptions = {
    marketIndex: -1,
    size: 1,
    minAvailableBalanceForOrder: 5000,
    minPrice: 0.01,
    minSleepSeconds: 20,
    maxPositionSize: 20,
    crossMkt: false,
  }

  let options = { ...defaultOptions, ..._options };
  console.log("============ bidSniper ================");
  console.log(options);

  let {
    marketIndex,
    crossMkt,
    size,
    maxPositionSize,
    minPrice,
    minAvailableBalanceForOrder } = options;


  let positionSize = 0;
  if (client.positions && client.positions.length > 0) {

    positionSize = client.positions
      .filter(a => a.marketIndex === options.marketIndex)
      .reduce((a, b) => a + b.position, 0);

  }

  let availableBalance = toPrec(marginAccountState.availableBalanceInitial, 4);

  let marketAddress: PublicKey,
    fairMarketPrice: number,
    orderbook: types.DepthOrderbook;

  ({ marketAddress, fairMarketPrice, orderbook } = await getMarketData(marketIndex));

  let orders: types.Order[] = client.orders;


  console.log(processingAskOrders[marketIndex]);
  // if (processingAskOrders[marketIndex]) {

  try {
    //TODO: Make Sure it doesn't run if an other process is already running.
    //processingAskOrders[marketIndex] = true;

    let wantedOrders = [];
    console.log(`Available Balance (Initial): ${availableBalance} ${minAvailableBalanceForOrder}`);
    console.log(`Position Size: ${positionSize}`);
    console.log(`fairMarketPrice: ${fairMarketPrice}`);
    console.log(`Price to ask: ${minPrice}`);

    let wantedOrder = {
      market: Exchange.markets.markets[marketIndex].address,
      price: toPrec(minPrice, 4),
      size: size,
      side: types.Side.ASK
    }

    if (!orderbook || orderbook.bids.length == 0) {
      console.log("No Bids on OrderBook");
    } else if (positionSize >= 0 || Math.abs(positionSize) + size >= maxPositionSize) {
      console.log("Position too big");
    } else if (availableBalance < minAvailableBalanceForOrder) {
      console.log("Initial Balance too low");
    } else {

      // Get the BID
      let topBid = parseFloat(orderbook.bids[0].price.toFixed(4))
      let topSize = parseFloat(orderbook.bids[0].size.toFixed(4))
      console.log(topBid, topSize);

      if (topBid >= minPrice && topSize >= size) {
        wantedOrder.price = toPrec((crossMkt ? topBid : topBid + 0.001), 4);
        wantedOrders.push(wantedOrder);
        console.log("BID", topBid, wantedOrder.price);
        console.log(wantedOrders);
      } else {
        console.log("No Order Needed");
      }

    }

    await convergeAskOrders(marketIndex, orders, wantedOrders, client, .01);

  } catch (e) {
    console.log(e);

  } finally {
    //processingAskOrders[marketIndex] = false;
  }

}

async function fairAskStrategy(
  client: Client,
  marginAccountState: types.MarginAccountState,
  _options: any
) {

  let defaultOptions = {
    marketIndex: -1,
    crossMkt: false,
    fairMarketPriceSpread: 1.25,
    size: 1,
    minAvailableBalanceForOrder: 180,
    minPrice: 0.01
  }

  let options = { ...defaultOptions, ..._options };
  console.log("============ fairAskStrategy ================");
  console.log(options);


  let {
    marketIndex,
    crossMkt,
    fairMarketPriceSpread,
    size,
    minAvailableBalanceForOrder,
    minPrice } = options;


  if (marginAccountState && marginAccountState.availableBalanceInitial < minAvailableBalanceForOrder) {
    console.log(`availableBalanceMaintenance  IS LOW ( ${marginAccountState.availableBalanceInitial} )`);
    return;
  }

  let marketAddress: PublicKey,
    fairMarketPrice: number,
    orderbook: types.DepthOrderbook;

  ({ marketAddress, fairMarketPrice, orderbook } = await getMarketData(marketIndex));

  let orders: types.Order[] = client.orders;


  console.log(processingAskOrders[marketIndex]);
  if (processingAskOrders[marketIndex]) {
    return;
  }
  else {
    try {
      processingAskOrders[marketIndex] = true;

      let wantedOrders = [];
      let fairPriceToAsk = fairMarketPrice * fairMarketPriceSpread;
      fairPriceToAsk = parseFloat(fairPriceToAsk.toFixed(4));

      console.log(`fairMarketPrice: ${fairMarketPrice}`);

      fairPriceToAsk = Math.max(fairPriceToAsk, minPrice);
      console.log(`Price to ask: ${fairPriceToAsk}`);

      let wantedOrder = {
        market: Exchange.markets.markets[marketIndex].address,
        price: fairPriceToAsk,
        size: size,
        side: types.Side.ASK
      }

      // Looking at the top bid to figure out 
      // if we need to adjust our ask a bit higher
      // to avoid taker order.
      if (crossMkt == false && orderbook.bids.length > 0) {
        let topBid = parseFloat(orderbook.bids[0].price.toFixed(4))
        wantedOrder.price = Math.max(topBid + 0.01, fairPriceToAsk);
        console.log("BID", topBid, wantedOrder.price);
      }

      wantedOrders.push(wantedOrder);

      await convergeAskOrders(marketIndex, orders, wantedOrders, client, .01);

    } catch (e) {
      console.log(e);

    } finally {
      processingAskOrders[marketIndex] = false;
    }
  }
}

export async function fairBidStrategy(
  client: Client,
  marginAccountState: types.MarginAccountState,
  _options: any) {

  let defaultOptions = {
    marketIndex: -1,
    crossMkt: false,
    fairMarketPriceSpread: 1.25,
    size: 1,
    maxPrice: 1.01
  };

  let options = { ...defaultOptions, ..._options };
  console.log("============ fairBidStrategy ================");
  console.log(options);

  let {
    marketIndex,
    size,
    crossMkt,
    fairMarketPriceSpread,
    maxPrice } = options;

  let marketAddress: PublicKey,
    fairMarketPrice: number,
    orderbook: types.DepthOrderbook;

  ({ marketAddress, fairMarketPrice, orderbook } = await getMarketData(marketIndex));

  let orders: types.Order[] = client.orders;
  let positions: types.Position[] = client.positions;

  if (positions && positions.length > 0) {
    positions = positions.filter(p => {
      return p.marketIndex == marketIndex && p.position < 0;
    })
  }

  if (positions && positions.length == 0) {
    console.log("No short positions");
    return;
  }

  console.log(processingBidOrders[marketIndex]);

  if (processingBidOrders[marketIndex]) {
    return;
  }
  else {
    try {
      processingBidOrders[marketIndex] = true;

      let wantedOrders = [];
      let fairPriceToBid = fairMarketPrice * (fairMarketPriceSpread);
      fairPriceToBid = parseFloat(fairPriceToBid.toFixed(4));

      console.log(`Fair market price: ${fairMarketPrice}`);
      console.log(`Bid Price: ${fairPriceToBid}`);

      let wantedOrder = {
        market: Exchange.markets.markets[marketIndex].address,
        price: fairPriceToBid,
        size: size,
        side: types.Side.BID
      }

      // Looking at the top bid to figure out 
      // if we need to adjust our ask a bit higher
      // to avoid taker order.
      if (!crossMkt && orderbook.asks.length > 0) {
        let topAsk = parseFloat(orderbook.asks[0].price.toFixed(4))
        wantedOrder.price = Math.min(topAsk - 0.01, fairPriceToBid);
        console.log("BID", topAsk, wantedOrder.price);
      }

      wantedOrder.price = Math.min(wantedOrder.price, maxPrice);
      wantedOrders.push(wantedOrder);

      await convergeBidOrders(marketIndex, orders, wantedOrders, client, .01);

    } catch (e) {
      console.log(e);

    } finally {
      processingBidOrders[marketIndex] = false;
    }
  }
}


async function shortPositionsDelta(
  client: Client,
  marginAccountState: types.MarginAccountState,
  _options: any) {


  let defaultOptions: OptionsIfc = {
    deltaNeutralPosition: 1,
    minBuySize: 1,
    minSellSize: 5
  }

  let options = { ...defaultOptions, ..._options };
  console.log("============ shortPositionsDelta ================");
  console.log(options);

  let positions: types.Position[] = client.positions;
  console.log(positions);

  if (positions.length > 0) {

    let p = positions
      .filter(p => p.position < 0)

    let results = await Promise.all(p.map(async p => {

      let fairMarketPrice: number, orderbook: types.DepthOrderbook, greeks: any;
      ({ fairMarketPrice, orderbook, greeks } = await getMarketData(p.marketIndex));

      let market = Exchange.markets.getMarket(p.market);
      let deltaNeutral = toPrec(greeks["delta"] * p.position, 4);
      return { marketIndex: p.marketIndex, exp: market.expiryIndex, kind: market.kind, strike: market.strike, fairMarketPrice, deltaNeutral, averageCost: p.costOfTrades / p.position, greeks, position: p };

    }))

    let deltaNeutralPosition = results.reduce((acc, cur) => acc + cur.deltaNeutral, 0)

    // Increase deltaNeutralPosition if bullish (>1), decrease if bearish (<1)
    deltaNeutralPosition = deltaNeutralPosition * options.deltaNeutralPosition;

    await kucoinHedger.adjustSpotLongs(Math.abs(deltaNeutralPosition), options);

    console.log(`${deltaNeutralPosition} delta neutral position`);

  }
}


async function getMarketData(marketIndex: number) {
  let marketAddress = Exchange.markets.markets[marketIndex].address;
  await Exchange.markets.markets[marketIndex].updateOrderbook();

  let fairMarketPrice = await Exchange.getMarkPrice(marketIndex);
  let orderbook: types.DepthOrderbook = Exchange.markets.markets[marketIndex].orderbook;

  let greeksIndex = utils.getGreeksIndex(marketIndex);
  let callDelta = toPrec(1 - utils.convertNativeBNToDecimal(
    Exchange.greeks.productGreeks[greeksIndex].delta,
    constants.PRICING_PRECISION
  ), 4);

  let sigma = toPrec(Decimal.fromAnchorDecimal(
    Exchange.greeks.productGreeks[greeksIndex].volatility
  ).toNumber(), 4);

  let vega = toPrec(Decimal.fromAnchorDecimal(
    Exchange.greeks.productGreeks[greeksIndex].vega
  ).toNumber(), 4);

  return { marketAddress, fairMarketPrice, orderbook, greeks: { delta: callDelta, sigma, vega } };
}


async function convergeAskOrders(marketIndex: number, _orders: types.Order[], wantedAskOrders: any[], client: Client, shoulder: number = 0) {

  let cancelOrders = [];
  let newOrders = [];

  let askOrders = _orders.filter(order => order.marketIndex == marketIndex && order.side == 1);

  if (askOrders.length == 0 && wantedAskOrders.length > 0) {
    newOrders = wantedAskOrders;
  } else if (askOrders.length > 0 && wantedAskOrders.length > 0) {

    askOrders.forEach((order) => {
      let foundOrderIndex = wantedAskOrders.findIndex(wantedOrder => {
        if (wantedOrder.side == 1 &&
          (
            (wantedOrder.price <= order.price + shoulder && wantedOrder.price >= order.price - shoulder)
            && (wantedOrder.size == order.size)
          )) {
          return true;
        } else {
          return false;
        }
      });

      if (foundOrderIndex == -1) {
        cancelOrders.push(order);
      } else {
        wantedAskOrders.splice(foundOrderIndex, 1);
      }
    }
    );

    newOrders = wantedAskOrders;
  } else if (askOrders.length > 0 && wantedAskOrders.length == 0) {
    cancelOrders = askOrders;
  }


  printConvergedOrders(wantedAskOrders, cancelOrders, newOrders);

  await placeOrders(cancelOrders, newOrders, client);

}

async function convergeBidOrders(marketIndex: number, _orders: types.Order[], wantedBidOrders: any[], client: Client, shoulder: number = 0) {

  let cancelOrders = [];
  let newOrders = [];

  let bidOrders = _orders.filter(
    order => order.marketIndex == marketIndex &&
      order.side == 0);

  if (bidOrders.length == 0 && wantedBidOrders.length > 0) {
    newOrders = wantedBidOrders;

  } else if (bidOrders.length > 0 && wantedBidOrders.length > 0) {

    bidOrders.forEach((bidOrder) => {
      let foundOrderIndex = wantedBidOrders.findIndex(wantedOrder => {
        if (wantedOrder.side == 0 &&
          (
            (Math.abs(bidOrder.price - wantedOrder.price) <= shoulder)
            && (wantedOrder.size == bidOrder.size)
          )) {
          return true;
        } else {
          return false;
        }
      });

      if (foundOrderIndex == -1) {
        cancelOrders.push(bidOrder);
      } else {
        wantedBidOrders.splice(foundOrderIndex, 1);
      }
    });

    newOrders = wantedBidOrders;
  } else {
    cancelOrders.push(...bidOrders);
  }

  printConvergedOrders(wantedBidOrders, cancelOrders, newOrders);
  await placeOrders(cancelOrders, newOrders, client);

}

function printConvergedOrders(wantedOrders: any[], cancelOrders: any[], newOrders: any[]) {
  console.log("Wanted Orders");
  console.log(wantedOrders);
  console.log("Cancel Orders");
  console.log(cancelOrders);
  console.log("New Orders");
  console.log(newOrders);
}


async function placeOrders(cancelOrders: any[], newOrders: any[], client: Client) {


  while (newOrders.length > 0 || cancelOrders.length > 0) {

    if (newOrders.length > 0) {
      if (cancelOrders.length == 0) {
        let order = newOrders.shift();
        await client.placeOrder(order.market, order.price * 1e6, order.size * 1e3, order.side);
      } else {
        let cancelOrder = cancelOrders.shift();
        let newOrder = newOrders.shift();
        await client.cancelAndPlaceOrder(
          cancelOrder.market,
          cancelOrder.orderId,
          cancelOrder.side,
          newOrder.price * 1e6,
          newOrder.size * 1e3,
          newOrder.side
        );
      }
    } else
      if (cancelOrders.length > 0) {
        let cancelOrder = cancelOrders.shift();
        await client.cancelOrder(cancelOrder.market, cancelOrder.orderId, cancelOrder.side);

      }
  }

}


function toPrec(x: number, precision: number): number {
  return parseFloat(x.toFixed(precision));
}


export default {
  run: runMarketMaker,

}