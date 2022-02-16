import {
    Wallet,
    Client,
    Exchange,
    Network,
    utils,
    types,
    events,
    subscription,
    programTypes

} from "@zetamarkets/sdk";

import { Position, Order, Side } from "@zetamarkets/sdk/src/types";

const FAIR_MARKET_PRICE_SPREAD: number = parseFloat(process.env["FAIR_MARKET_PRICE_SPREAD"]) || 0.01;

export interface Hedger {
  adjustSpotLongs(desiredSize: number);
}

export async function getFairMarketPrice(index: number): Promise<number> {
    return await Exchange.getMarkPrice(index);
  }
  

export async function placeAskOrder(fairMarketPrice: number, orderLots: number, client: Client, index: number) {
    
    const orderPrice = utils.convertDecimalToNativeInteger(fairMarketPrice * FAIR_MARKET_PRICE_SPREAD);

    // Place a bid order.
    await client.placeOrder(
        Exchange.markets.markets[index].address,
        orderPrice,
        orderLots,
        types.Side.ASK
    );

}

export async function placeAskOrderForPrice(orderPrice: number, orderLots: number, client: Client, index: number) {
    console.log("SELL",orderPrice,orderLots,index);
    
    // Place a bid order.
    await client.placeOrder(
        Exchange.markets.markets[index].address,
        orderPrice * 1e6,
        orderLots * 1e3,
        types.Side.ASK
    );

}

export async function placeBidOrderForPrice(orderPrice: number, orderLots: number, client: Client, index: number) {
    console.log("BUY",orderPrice,orderLots,index);

    // Place a bid order.
    await client.placeOrder(
        Exchange.markets.markets[index].address,
        orderPrice * 1e6,
        orderLots * 1e3,
        types.Side.BID
    );

}

export async function placeBidOrder(fairMarketPrice: number, orderLots: number, client: Client, index: number) {
    const orderPrice = utils.convertDecimalToNativeInteger(fairMarketPrice * (2 - FAIR_MARKET_PRICE_SPREAD));

    // Place a bid order.
    await client.placeOrder(
        Exchange.markets.markets[index].address,
        orderPrice,
        orderLots,
        types.Side.BID
    );

}

export async function cancelAsks(orders: types.Order[], client: Client) {

    if (!orders)
      return;
  
    for (let i = 0; i < orders.length; i++) {
  
      if (orders[i].side == types.Side.ASK) {
        // console.log(`Cancelling order ${orders[i].orderId}`);
        await client.cancelOrder(orders[i].market, orders[i].orderId, orders[i].side);
        // console.log(`Cancelled order ${orders[i].orderId}`);
      }
  
    }
  }
  
  export async function cancelBids(orders: types.Order[], client: Client) {
  
    if (!orders)
      return;
  
    for (let i = 0; i < orders.length; i++) {
  
      if (orders[i].side == types.Side.BID) {
        // console.log(`Cancelling order ${orders[i].orderId}`);
        await client.cancelOrder(orders[i].market, orders[i].orderId, orders[i].side);
        // console.log(`Cancelled order ${orders[i].orderId}`);
      }
  
    }
  }

  export function getIndexForPrice(price: number) {

    if (!price)
      throw new Error("Price is required");
  
    let frontExpiryIndex = Exchange.zetaGroup.frontExpiryIndex;
  
    let markets = Exchange.markets.getMarketsByExpiryIndex(frontExpiryIndex);
  
    for (let j = 0; j < markets.length; j++) {
      let market = markets[j];
  
      if (market.strike >= price - 1) {
        console.log(`${frontExpiryIndex} ${market.marketIndex} ${market.kind} ${market.strike}`);
        return market.marketIndex;
      }
    }
  
    throw new Error(`No market found for strike ${price}`);
  
  }