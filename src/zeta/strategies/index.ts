import {
    constants,
    Decimal,
    Client,
    Exchange,
    utils,
    types,

} from "@zetamarkets/sdk";

import { PublicKey } from "@solana/web3.js";

import {
    HedgerIfc,
    OptionsIfc,
    _getSOLBalance,
    logOrder
} from "../../lib";

import strat_util from "./strat_util";

const PUB_KEY = process.env["pub_key"]!;
const LEDGER_PUB_KEY = process.env["ledger_pub_key"]!;

export async function shortPositionsDelta(
    client: Client,
    marginAccountState: types.MarginAccountState,
    _options: any,
    hedger: HedgerIfc = null) {


    let defaultOptions: OptionsIfc = {
        deltaNeutralPosition: 1,
        minBuySize: 1,
        minSellSize: 5,
        offlineSize: strat_util.toPrec(await _getSOLBalance([PUB_KEY, LEDGER_PUB_KEY]), 2),
    }

    let options = { ...defaultOptions, ..._options };
    console.log("============ shortPositionsDelta ================");

    if (options.marginAccount)
        options.offlineSize += options.marginAccount;

    console.log(options);

    let positions: types.Position[] = client.positions;
    let reqDeltaNeutralPos = 0;

    console.log("\n\nPositions");
    console.log(positions);
    console.log("==============\n\n");

    if (positions.length > 0) {

        let p = positions
            .filter(p => p.position < 0)

        let zetaPositions = await Promise.all(p.map(async p => {

            let fairMarketPrice: number, orderbook: types.DepthOrderbook, greeks: any;
            ({ fairMarketPrice, orderbook, greeks } = await getMarketData(p.marketIndex));

            let market = Exchange.markets.getMarket(p.market);
            let deltaNeutral = strat_util.toPrec(greeks["delta"] * p.position, 4);
            return { marketIndex: p.marketIndex, exp: market.expiryIndex, kind: market.kind, strike: market.strike, fairMarketPrice, deltaNeutral, averageCost: p.costOfTrades / p.position, greeks, position: p };

        }))

        let reqDeltaNeutralPos = Math.abs(zetaPositions.reduce((acc, cur) => acc + cur.deltaNeutral, 0))

        // Increase deltaNeutralPosition if bullish (>1), decrease if bearish (<1)
        reqDeltaNeutralPos = reqDeltaNeutralPos * options.deltaNeutralPosition;

    }

    if (hedger) {
        await hedger.adjustSpotLongs(Math.min(reqDeltaNeutralPos - options.offlineSize, 0), options);
    }

    console.log("|| Offline Size", options.offlineSize);
    console.log("|| Req. Trading Acct. Size)", reqDeltaNeutralPos - options.offlineSize);
    console.log("|| Total Req. Delta Neutral Size", reqDeltaNeutralPos);
}

export async function callBidStrategy(
    client: Client,
    marginAccountState: types.MarginAccountState,
    _options: any) {

    let defaultOptions = {
        marketIndex: -1,
        crossMkt: false,
        fairMarketPriceSpread: 1.25,
        size: 1,
        maxPrice: 1.01,
        shoulder: 0.002,
        closeOnly: true,
        maxPositionSize: 0
    };

    let options = { ...defaultOptions, ..._options };
    console.log("============ fairBidStrategy ================");
    console.log(options);

    let {
        marketIndex,
        size,
        crossMkt,
        fairMarketPriceSpread,
        maxPrice,
        shoulder } = options;

    let marketAddress: PublicKey,
        fairMarketPrice: number,
        orderbook: types.DepthOrderbook;

    ({ marketAddress, fairMarketPrice, orderbook } = await getMarketData(marketIndex));

    let orders: types.Order[] = client.orders;
    let positions: types.Position[] = client.positions;
    let positionSize = 0;

    if (positions && positions.length > 0) {
        positions = positions.filter(p => {
            return p.marketIndex == marketIndex && p.position < 0;
        })
        positionSize = calcPositionSize(client, marketIndex);
    }

    if (options.closeOnly) {
        if (positionSize >= 0) {
            console.log("No short positions");
            return;
        }
    } else {
        if (positionSize + size > options.maxPositionSize) {
            console.log("OPEN Position too big");
            return;
        }
    }



    try {

        let wantedOrders = [];
        let fairPriceToBid = strat_util.toPrec(fairMarketPrice * (fairMarketPriceSpread), 4);

        console.log(`Fair market price: ${fairMarketPrice}`);
        console.log(`Bid Price: ${fairPriceToBid}`);

        let wantedOrder = {
            market: Exchange.markets.markets[marketIndex].address,
            price: strat_util.toPrec(fairPriceToBid, 3),
            size: size,
            side: types.Side.BID,
            orderType: crossMkt ? types.OrderType.FILLORKILL : types.OrderType.POSTONLY
        }

        if (orderbook && orderbook.bids.length > 0) {
            let filteredBids =
                getFilteredBids(marketIndex, orders, orderbook);

            if (filteredBids.length > 0) {
                let topBid = parseFloat(filteredBids[0].price.toFixed(4));
                if (wantedOrder.price > topBid)
                    wantedOrder.price = strat_util.toPrec(topBid + strat_util.sigmoid(Math.random()) * 0.001, 4);
            }
        }


        // Looking at the top ask to figure out 
        // if we need to adjust our bid a bit lower
        // to avoid taker order.
        if (orderbook && orderbook.asks.length > 0) {
            let topAsk = parseFloat(orderbook.asks[0].price.toFixed(4))
            if (!crossMkt) {
                wantedOrder.price = Math.min(topAsk - 0.001, wantedOrder.price);
                console.log(`topAsk ${topAsk}, wantedOrder.price ${wantedOrder.price}`);
            } else {
                wantedOrder.price = Math.min(topAsk, fairPriceToBid);
                if (wantedOrder.price > maxPrice) {
                    console.log(`Price to HIGH for cross market (FOK) order.
             ${wantedOrder.price} MAX=${maxPrice}`);
                    return;
                }
            }
        }

        wantedOrder.price = strat_util.toPrec(Math.min(wantedOrder.price, maxPrice), 4);
        wantedOrders.push(wantedOrder);

        await convergeBidOrders(
            marketIndex, orders, wantedOrders, client, shoulder);

    } catch (e) {
        console.log(e);

    } finally {

    }
}

export async function callOfferStrategy(
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
        maxPositionSize: 0,
        minPrice: 0.01,
        shoulder: 0.005
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
        minPrice,
        shoulder,
        maxPositionSize } = options;


    if (marginAccountState && marginAccountState.availableBalanceInitial < minAvailableBalanceForOrder) {
        console.log(`availableBalanceMaintenance  IS LOW ( ${marginAccountState.availableBalanceInitial} )`);
        return;
    }

    let positionSize = 0;
    if (client.positions && client.positions.length > 0) {

        positionSize = client.positions
            .filter(a => a.marketIndex === options.marketIndex)
            .reduce((a, b) => a + b.position, 0);
    }


    let marketAddress: PublicKey,
        fairMarketPrice: number,
        orderbook: types.DepthOrderbook;

    ({ marketAddress, fairMarketPrice, orderbook } = await getMarketData(marketIndex));

    let orders: types.Order[] = client.orders;

    try {

        let wantedOrders = [];
        let fairPriceToAsk = fairMarketPrice * fairMarketPriceSpread;
        fairPriceToAsk = parseFloat(fairPriceToAsk.toFixed(4));

        fairPriceToAsk = strat_util.toPrec(Math.max(fairPriceToAsk, minPrice), 4);

        console.log(`|| fairMarketPrice: ${fairMarketPrice}`);
        console.log(`|| Price to ask: ${fairPriceToAsk}`);
        console.log(`|| Position Size (max): ${positionSize} (${maxPositionSize})`);

        let wantedOrder = {
            market: Exchange.markets.markets[marketIndex].address,
            price: strat_util.toPrec(fairPriceToAsk, 4),
            size: size,
            side: types.Side.ASK,
            orderType: crossMkt ? types.OrderType.FILLORKILL : types.OrderType.POSTONLY
        }

        if (Math.abs(positionSize) + size > maxPositionSize) {

            console.error("Position too big");

        } else {

            if (orderbook && orderbook.asks.length > 0) {
                let filteredAsks = getFilteredAsks(
                    marketIndex, client.orders, orderbook);

                if (filteredAsks.length > 0) {
                    let topAsk = filteredAsks[0].price;
                    wantedOrder.price =
                        Math.max(wantedOrder.price, topAsk - strat_util.sigmoid(Math.random()) * 0.001);
                }
            }

            if (orderbook && orderbook.bids.length > 0) {
                let topBid = parseFloat(orderbook.bids[0].price.toFixed(4));

                if (crossMkt == false) {
                    wantedOrder.price = Math.max(topBid + 0.001, wantedOrder.price);
                    console.log("BID", topBid, wantedOrder.price);
                } else {
                    wantedOrder.price = Math.max(topBid, fairPriceToAsk);
                }
            }

            wantedOrder.price = strat_util.toPrec(wantedOrder.price, 4);
            wantedOrders.push(wantedOrder);


        }
        await convergeAskOrders(marketIndex, orders, wantedOrders, client, shoulder);

    } catch (e) {
        console.log(e);

    } finally {

    }
}

export async function callBidSniper(
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
    positionSize = calcPositionSize(client, marketIndex);

    let availableBalance = strat_util.toPrec(marginAccountState.availableBalanceInitial, 4);

    let marketAddress: PublicKey,
        fairMarketPrice: number,
        orderbook: types.DepthOrderbook;

    ({ marketAddress, fairMarketPrice, orderbook } = await getMarketData(marketIndex));

    let orders: types.Order[] = client.orders;


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
            price: strat_util.toPrec(minPrice, 4),
            size: size,
            side: types.Side.ASK,
            orderType: crossMkt ? types.OrderType.FILLORKILL : types.OrderType.POSTONLY,
        }

        if (!orderbook || orderbook.bids.length == 0) {
            console.log("No Bids on OrderBook");
        } else if (Math.abs(positionSize) > 0 && Math.abs(positionSize) + size > maxPositionSize) {
            console.log("Position too big");
        } else if (availableBalance < minAvailableBalanceForOrder) {
            console.log("Initial Balance too low");
        } else {

            // Get the BID
            let topBid = parseFloat(orderbook.bids[0].price.toFixed(4))
            let topSize = parseFloat(orderbook.bids[0].size.toFixed(4))
            console.log(topBid, topSize);

            if (topBid >= minPrice && topSize >= size) {
                wantedOrder.price = strat_util.toPrec((crossMkt ? topBid : topBid + 0.001), 4);
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

async function getMarketData(marketIndex: number) {
    let marketAddress = Exchange.markets.markets[marketIndex].address;
    await Exchange.markets.markets[marketIndex].updateOrderbook();

    let fairMarketPrice = await Exchange.getMarkPrice(marketIndex);
    let orderbook: types.DepthOrderbook = Exchange.markets.markets[marketIndex].orderbook;

    let greeksIndex = utils.getGreeksIndex(marketIndex);
    let callDelta = strat_util.toPrec(1 - utils.convertNativeBNToDecimal(
        Exchange.greeks.productGreeks[greeksIndex].delta,
        constants.PRICING_PRECISION
    ), 4);

    let sigma = strat_util.toPrec(Decimal.fromAnchorDecimal(
        Exchange.greeks.productGreeks[greeksIndex].volatility
    ).toNumber(), 4);

    let vega = strat_util.toPrec(Decimal.fromAnchorDecimal(
        Exchange.greeks.productGreeks[greeksIndex].vega
    ).toNumber(), 4);

    return { marketAddress, fairMarketPrice, orderbook, greeks: { delta: callDelta, sigma, vega } };
}

function getFilteredBids(
    marketIndex: number,
    orders: any[],
    orderbook: types.DepthOrderbook) {

    let filteredBids = orderbook.bids.filter((bid) => {
        return orders.findIndex((order) => {
            return order.price == bid.price &&
                order.marketIndex == marketIndex &&
                order.side == types.Side.BID;
        }) >= 0 ? false : true;
    });
    return filteredBids;
}

function getFilteredAsks(
    marketIndex: number,
    orders: any[],
    orderbook: types.DepthOrderbook) {

    let filteredAsks = orderbook.asks.filter((ask) => {
        return orders.findIndex((order) => {
            return order.price == ask.price &&
                order.marketIndex == marketIndex &&
                order.side == types.Side.ASK;
        }) >= 0 ? false : true;
    });
    return filteredAsks;
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

    strat_util.printConvergedOrders(wantedBidOrders, cancelOrders, newOrders);
    await placeOrders(cancelOrders, newOrders, client);

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


    strat_util.printConvergedOrders(wantedAskOrders, cancelOrders, newOrders);

    await placeOrders(cancelOrders, newOrders, client);

}



async function placeOrders(cancelOrders: any[], newOrders: any[], client: Client) {

    while (newOrders.length > 0 || cancelOrders.length > 0) {
        let _log;

        try {

            _log = {};

            if (newOrders.length > 0) {
                if (cancelOrders.length == 0) {

                    let order = newOrders.shift();
                    _log._type = "Place";
                    _log._order = { newOrder: order };
                    _log._trx = await client.placeOrderV2(
                        order.market,
                        order.price * 1e6,
                        order.size * 1e3,
                        order.side,
                        order.orderType,
                        Date.now());

                } else {

                    let cancelOrder = cancelOrders.shift();
                    let newOrder = newOrders.shift();

                    _log._type = "Cancel and Place";
                    _log._order = { cancelOrder, newOrder };
                    _log._trx = await client.cancelAndPlaceOrderV2(
                        cancelOrder.market,
                        cancelOrder.orderId,
                        cancelOrder.side,
                        newOrder.price * 1e6,
                        newOrder.size * 1e3,
                        newOrder.side,
                        newOrder.orderType,
                        Date.now()
                    );

                }
            } else if (cancelOrders.length > 0) {

                let cancelOrder = cancelOrders.shift();

                _log._type = "Cancel";
                _log._order = { cancelOrder };


                _log._trx = await client.cancelOrder(
                    cancelOrder.market,
                    cancelOrder.orderId,
                    cancelOrder.side);

            }

            if (_log._trx)
                logOrder(_log);

        } catch (err) {

            _log._err = err;
            logOrder(_log);
        }

    }
}

function calcPositionSize(client: Client, marketIndex: number) {
    let positionSize = 0;
    if (client.positions && client.positions.length > 0) {

        positionSize = client.positions
            .filter(a => a.marketIndex === marketIndex)
            .reduce((a, b) => a + b.position, 0);

    }
    return positionSize;
}


