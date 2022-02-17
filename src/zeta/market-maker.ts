require("dotenv").config();

import { readFile, readFileSync, watch } from 'fs';
import { loadActions, loadOptionsForAction, optionsIfc } from '../configuration';

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

import { KucoinHedger } from "../kucoin/kucoin"
import { sleep } from '@zetamarkets/sdk/dist/utils';

const SLEEP_MS: number = parseInt(process.env.SLEEP_MS) || 15000;
const FAIR_MARKET_PRICE_SPREAD: number = parseFloat(process.env["FAIR_MARKET_PRICE_SPREAD"]) || 0.01;
const NETWORK_URL = process.env["network_url"]!;
const PROGRAM_ID = new PublicKey(process.env["program_id"]);
let processingAskOrders = new Array<boolean>(250);
let processingBidOrders = new Array<boolean>(250);

const hedger: Hedger = new KucoinHedger();
let config;

async function main() {

  console.log("Starting");

  // readConfig();

  // watch("mm_config.json", (event, filename) => {
  //   if (filename && event === 'change') {
  //     console.log(`${filename} file Changed`);
  //     readConfig();
  //   }
  // });


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

  const client = await Client.load(
    connection,
    wallet,
    utils.defaultCommitment()

  );

  await client.updateState();
  utils.displayState();

  let oraclePrice: number = Exchange.oracle.getPrice("SOL/USD").price;
  console.log(`Oracle Price: ${oraclePrice}`);

  setInterval((async () => {

    await client.updateState();

    oraclePrice = Exchange.oracle.getPrice("SOL/USD").price;
    let index: number = getIndexForPrice(oraclePrice);

    let marginAccountState = Exchange.riskCalculator.getMarginAccountState(
      client.marginAccount
    );

    console.log("=================================================");
    console.log(marginAccountState);
    console.log("=================================================");

    if (client.positions && client.positions.length > 0) {
      let pos = client.positions.map((p) => { return { position: p.position, costOfTrades: p.costOfTrades, marketIndex: p.marketIndex, avgPrice: (p.costOfTrades / p.position).toFixed(4) } });
      console.log(pos);
    }

    let runnableActions = {
      "shortPositionsDelta": shortPositionsDelta,
      "fairBidStrategy": fairBidStrategy,
      "fairAskStrategy": fairAskStrategy,
    };

    let actions: any[] = loadActions().filter((a: any) => a.status === "active");

    let ra = [];
    for (let i = 0; i < actions.length; i++) {
      ra.push(runnableActions[actions[i].name](
        client, marginAccountState, actions[i].options));
    }

    await Promise.all(
      ra
    );

    console.log("Actions Finished");

  }), 60000);

}


async function readConfig() {
  let _file = await readFileSync("mm_config.json");
  console.log(_file.length);
  if (_file.length > 0) {
    config = JSON.parse(_file.toString());
    console.log(config);
  }
}

/* 
* @param client 
* @param marketIndex 
* @param marginAccountState 
* @param crossMkt Set to true if don't mind creating a taker order.
* @returns 
*/
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
      console.log("Processing Orders");

      let wantedOrders = [];
      let fairPriceToAsk = fairMarketPrice * fairMarketPriceSpread;
      fairPriceToAsk = parseFloat(fairPriceToAsk.toFixed(4));

      console.log(fairMarketPrice);

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

      console.log("DONE PROCESSING ORDERS");

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
      console.log("Processing Bid Orders");

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

      console.log("DONE PROCESSING ORDERS");

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


  let defaultOptions: optionsIfc = {
    deltaNeutralPosition: 1,
    minBuySize:1,
    minSellSize:5
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
      let deltaNeutral = toPrecision(greeks["delta"] * p.position, 4);
      return { marketIndex: p.marketIndex, exp: market.expiryIndex, kind: market.kind, strike: market.strike, fairMarketPrice, deltaNeutral, averageCost: p.costOfTrades / p.position, greeks, position: p };

    }))

    let deltaNeutralPosition = results.reduce((acc, cur) => acc + cur.deltaNeutral, 0)

    // Increase deltaNeutralPosition if bullish (>1), decrease if bearish (<1)
    deltaNeutralPosition = deltaNeutralPosition * options.deltaNeutralPosition;

    hedger.adjustSpotLongs(Math.abs(deltaNeutralPosition), options);

    console.log(`${deltaNeutralPosition} delta neutral position`);

  }


}


async function snipeStrategy(
  client: Client,
  marketIndex: number,
  marginAccountState: types.MarginAccountState) {


  let fairMarketPrice: number, orderbook: types.DepthOrderbook, greeks: any;
  ({ fairMarketPrice, orderbook, greeks } = await getMarketData(marketIndex));

  console.log("Greek", greeks);

  let orders: types.Order[] = client.orders;

  console.log(processingAskOrders[marketIndex]);
  if (processingAskOrders[marketIndex]) {
    return;
  }
  else {
    try {
      processingAskOrders[marketIndex] = true;
      console.log("Processing Orders");

      let wantedOrders = [];
      let fairPriceToAsk = fairMarketPrice * FAIR_MARKET_PRICE_SPREAD;
      let fairPriceToBid = fairMarketPrice * (2 - FAIR_MARKET_PRICE_SPREAD);

      fairPriceToAsk = parseFloat(fairPriceToAsk.toFixed(4));
      fairPriceToBid = parseFloat(fairPriceToBid.toFixed(4));

      console.log("Fair Market Range:", fairPriceToBid, fairMarketPrice, fairPriceToAsk);
      if (orderbook.bids.length > 0) {

        let topBid = parseFloat(orderbook.bids[0].price.toFixed(4));
        console.log("TOP BID", topBid);

        if (topBid >= fairPriceToBid) {
          console.log("HITTING BID");
          wantedOrders.push({
            market: Exchange.markets.markets[marketIndex].address,
            price: toPrecision(topBid, 4),
            size: 1,
            side: 1
          });
        }

      }

      await convergeAskOrders(marketIndex, client.orders, wantedOrders, client);

      console.log("DONE PROCESSING ORDERS");

    } catch (e) {
      console.log(e);

    } finally {
      processingAskOrders[marketIndex] = false;
    }
  }



}

async function getMarketData(marketIndex: number) {
  let marketAddress = Exchange.markets.markets[marketIndex].address;
  await Exchange.markets.markets[marketIndex].updateOrderbook();

  let fairMarketPrice = await Exchange.getMarkPrice(marketIndex);
  let orderbook: types.DepthOrderbook = Exchange.markets.markets[marketIndex].orderbook;

  let greeksIndex = utils.getGreeksIndex(marketIndex);
  let callDelta = toPrecision(1 - utils.convertNativeBNToDecimal(
    Exchange.greeks.productGreeks[greeksIndex].delta,
    constants.PRICING_PRECISION
  ), 4);

  let sigma = toPrecision(Decimal.fromAnchorDecimal(
    Exchange.greeks.productGreeks[greeksIndex].volatility
  ).toNumber(), 4);

  let vega = toPrecision(Decimal.fromAnchorDecimal(
    Exchange.greeks.productGreeks[greeksIndex].vega
  ).toNumber(), 4);

  return { marketAddress, fairMarketPrice, orderbook, greeks: { delta: callDelta, sigma, vega } };
}

/**
 * Converges ask orders
 * @param marketIndex
 * @param orders
 * @param wantedAskOrders
 * @param client
 * @param spread
 */
async function convergeAskOrders(marketIndex: number, _orders: types.Order[], wantedAskOrders: any[], client: Client, shoulder: number = 0) {


  let cancelOrders = [];
  let newOrders = [];

  let askOrders = _orders.filter(order => order.marketIndex == marketIndex && order.side == 1);


  // Cases
  // 1.No orders and no wanted orders
  // Do nothing

  // 2.Orders and no wanted orders
  // Cancel all orders

  // 3.No orders and wanted Orders
  //   Create new orders
  if (askOrders.length == 0 && wantedAskOrders.length > 0) {
    newOrders = wantedAskOrders;
  } else if (askOrders.length > 0 && wantedAskOrders.length > 0) {

    askOrders.forEach((order) => {
      let foundOrderIndex = wantedAskOrders.findIndex(wantedOrder => {
        if (wantedOrder.side == 1 &&

          (wantedOrder.price <= order.price + shoulder &&
            wantedOrder.price >= order.price - shoulder)) {
          console.log("SSDSDSDSDD");
          // console.log(wantedOrder.price,order.price + .1 )
          // console.log(wantedOrder.price,order.price - .1 )
          return true;
        } else {
          return false;
        }
      });

      // console.log(foundOrderIndex);
      if (foundOrderIndex == -1) {
        cancelOrders.push(order);
      } else {
        wantedAskOrders.splice(foundOrderIndex, 1);
      }
    }
    );

    newOrders = wantedAskOrders;
  }


  printConvergedOrders(wantedAskOrders, cancelOrders, newOrders);

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
          (Math.abs(bidOrder.price - wantedOrder.price) <= shoulder)) {
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


async function placeOrders(cancelOrders: any[], newOrders: any[], client: Client) {

  if (cancelOrders.length > 0) {
    await Promise.all(cancelOrders.map(async (order) => {
      await client.cancelOrder(order.market, order.orderId, order.side);
    }));
  }

  if (newOrders.length > 0) {
    await Promise.all(newOrders.map(async (order) => {
      await client.placeOrder(order.market, order.price * 1e6, order.size * 1e3, order.side);
    }));
  }
}

function toPrecision(x: number, precision: number) {
  return parseFloat(x.toFixed(precision));
}

async function exit(client: Client) {
  console.log("Exiting");
  await client.close();
  await Exchange.close();
  console.log("Exited");

}


export default main;