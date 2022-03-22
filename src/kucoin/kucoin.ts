require("dotenv").config();

import API from 'kucoin-node-sdk'
import config from './secret.config';

import { AccountType } from './lib/types';
import { OptionsIfc } from "../lib";

API.init(config);

const SYMBOL = process.env["SYMBOL"];
const SYMBOL_PAIR = process.env["SYMBOL_PAIR"];
const PRICE_DECIMALS: number = process.env["PRICE_DECIMALS"] ? parseInt(process.env["PRICE_DECIMALS"]) : 2;
const SIZE_DECIMALS: number = process.env["SIZE_DECIMALS"] ? parseInt(process.env["SIZE_DECIMALS"]) : 4;
const INSIDE_MKT_BUFFER: number = process.env["INSIDE_MKT_BUFFER"] ? parseInt(process.env["INSIDE_MKT_BUFFER"]) : 0.01;
const DESIRED_SIZE = process.env["DESIRED_SIZE"] ? parseFloat(process.env["DESIRED_SIZE"]) : 0.01;
const BUFFER = process.env["BUFFER"] ? parseFloat(process.env["BUFFER"]) : 0.01;


const ACCOUNT_TYPE = AccountType.trade;

export interface HedgerIfc {
    adjustSpotLongs(desiredSize: number, options: OptionsIfc)
}


export class KucoinHedger implements HedgerIfc {
    adjustSpotLongs = async (desiredSize: number = DESIRED_SIZE, options: OptionsIfc) => {
        const getTimestampRl = await API.rest.Others.getTimestamp();

        let position = await positions(ACCOUNT_TYPE, SYMBOL);
        let totalBuySideOrdersSize = await getTotalBuySideOrdersSize(SYMBOL_PAIR);

        desiredSize = +desiredSize - totalBuySideOrdersSize;
        console.log(`|| totalBuySideOrdersSize:`, totalBuySideOrdersSize);

        let sizeAdjustmentNeeded = 0;
        if (position && position.length > 0) {
            let currentPosition = position[0];

            if (currentPosition.balance < desiredSize - BUFFER) {

                if (desiredSize - currentPosition.balance > options.minBuySize)
                    sizeAdjustmentNeeded = desiredSize - currentPosition.balance;

                console.log(`\nNeed To Buy More - (MIN ${options.minBuySize}) ${desiredSize - currentPosition.balance}\n`);
            } else if (currentPosition.balance > desiredSize + BUFFER) {

                if (Math.abs(desiredSize - currentPosition.balance) > options.minSellSize)
                    sizeAdjustmentNeeded = desiredSize - currentPosition.balance;

                console.log(`\nNeed To Sell More - (Min ${options.minSellSize}) ${desiredSize - currentPosition.balance}\n`);

            } else {
                console.log("\n** Position size is good **\n");
            }

        }

        if (sizeAdjustmentNeeded != 0) {
            sizeAdjustmentNeeded = parseFloat(sizeAdjustmentNeeded.toFixed(SIZE_DECIMALS));
            let insideMarket = await getInsideMarket(SYMBOL_PAIR);
            console.log(`insideMarket: ${insideMarket}`);
            if (insideMarket[0] && insideMarket[1]) {
                sendOrder(
                    SYMBOL_PAIR,
                    parseFloat(insideMarket[0]), parseFloat(insideMarket[1]), sizeAdjustmentNeeded, parseFloat(insideMarket[1]));
            }
        }

    };
}


async function getTotalBuySideOrdersSize(
    symbolPair: string) {


    let optional = {
        symbol: symbolPair,
        status: "active"
    }

    console.log(symbolPair);
    console.log(optional);

    let res = await API.rest.Trade.Orders.getOrdersList("TRADE", optional);
    // console.log(res);
    if (res.msg) {
        throw new Error(res.msg);
    }

    if (res.data?.items?.length > 0) {
        let size = res.data.items
            .filter(order => order.side === "buy" && order.symbol === symbolPair)
            .reduce((acc, curr) => +curr.size + acc, 0);

        return size ? size : 0;
    } else {
        return 0;
    }

}

async function sendOrder(
    symbolPair: string,
    bid: number,
    ask: number,
    sizeAdjustment: number,
    minPrice?: number) {

    let limitPrice =
        parseFloat((sizeAdjustment > 0 ? ask - INSIDE_MKT_BUFFER : bid + INSIDE_MKT_BUFFER)
            .toFixed(PRICE_DECIMALS));

    limitPrice = minPrice ? Math.min(minPrice, limitPrice) : limitPrice;

    let order = {
        type: "market",
        symbol: symbolPair,
        side: sizeAdjustment > 0 ? "buy" : "sell",
        price: limitPrice,
        size: Math.abs(parseFloat(sizeAdjustment.toFixed(SIZE_DECIMALS))),
        clientOid: Date.now(),
    }

    console.log(order);

    let res = await API.rest.Trade.Orders.postOrder(order);
    console.log(res);
    if (res.msg) {
        throw new Error(res.msg);
    }

}

export async function transfer(
    currency: string,
    from: string,
    to: string,
    size: number) {


    let transfer = {
        clientOid: Date.now(),
        currency: SYMBOL,
        from: 'main',
        to: 'trade',
        amount: '1',
    }

    console.log(transfer);
    let res0 = await API.rest.User.Account.getAccountsList({ currency: SYMBOL });
    console.log(res0);

    let res = await API.rest.User.Account.innerTransfer(transfer);
    console.log(res);
    // if (res.msg) {
    //     throw new Error(res.msg);
    // }

}

export async function getInsideMarket(symbolPair: string) {

    let result = await API.rest.Market.OrderBook.getLevel2_20(symbolPair);

    return [
        result.data.bids?.[0][0],
        result.data.asks?.[0][0]
    ]
}

export async function positions(type: string, currency: string) {

    let res = await API.rest.User.Account.getAccountsList({ type, currency });
    if (res.msg) {
        throw new Error(res.msg);
    }

    return (res.data?.filter(account => account.currency == SYMBOL && account.type === 'trade'));

}

