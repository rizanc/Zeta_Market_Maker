require("dotenv").config();

import { Account, Connection, PublicKey } from '@solana/web3.js';
import { Market } from '@project-serum/serum';
import { mainModule } from 'process';
import { OrderParams } from '@project-serum/serum/lib/market';
import BN from 'bn.js';

enum TransactionType {
    BUY_SOL = 0, SELL_SOL = 1, NO_ORDER = 2
}

const sol_account = process.env.pub_key;
const usdc_account = process.env.usdc_account;
const connection = new Connection('https://solana-api.projectserum.com');

// SOL/USDC
const marketAddress = new PublicKey('9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT');

// Serum Dex Program v3 
const programAddress = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");

async function main() {
    const privateKey: string = process.env.PRIVATE_KEY!; // stored as an array string
    const keypair = new Account(Uint8Array.from(JSON.parse(privateKey)));

    let market = await Market.load(connection, marketAddress, {}, programAddress);

    // Fetching orderbooks
    let { bids, asks } = await fetchOrderBook(market);
    let { sortedBids, sortedAsks } = sortBidsAsks(bids, asks);


    // Placing orders
    let owner = keypair;

    let transactionType: TransactionType;
    let order: OrderParams<Account>;
    let payer;

    /*
        (0) 90.4 329.8
        90.286 2000
        90.264 1575.9
        90.158 3503.8
        90.122 1000
        90 2.5
        (6) 89.96 300 <== INSIDE ASK
        ===============================
        (0) 89.773 1  <== INSIDE BID
        89.734 300
        89.659 1000
        89.6 334.5
        89.517 2328.1
        89.502 1
        (6) 89.5 24.9
    */


    transactionType = TransactionType.NO_ORDER;
    let clientId = Date.now().toString();
    switch (+transactionType) {
        case TransactionType.SELL_SOL:
            payer = new PublicKey(sol_account);
            order = {
                owner,
                payer,
                side: "sell",
                price: +sortedBids[0][0] + 0.01,
                size: 5,
                orderType: "postOnly", // 'limit', 'ioc', 'postOnly',
                clientId: new BN(clientId)
            };

            break;
        case TransactionType.BUY_SOL:
            payer = new PublicKey(usdc_account);
            order = {
                owner,
                payer,
                side: "buy", // 'buy' or 'sell'
                price: +sortedBids[3][0] + 0.02,
                size: 5,
                orderType: "postOnly", // 'limit', 'ioc', 'postOnly'
                clientId: new BN(clientId)
            };
            break;
        default:
            break;

    }

    if (order) {
        console.log(order);
        console.log(`sol_account ${sol_account} \nusdc_account ${usdc_account}`);
        try {
            let res = await market.placeOrder(connection, order);
            console.log(`Order Transaction: ${res}`);
        } catch (err) {
            console.log(err);
        }

    }

    setInterval(async () => {

        let { bids, asks } = await fetchOrderBook(market);
        displayOrderBook(bids, asks);

        for (let openOrders of await market.findOpenOrdersAccountsForOwner(
            connection,
            owner.publicKey,
        )) {
            console.log(openOrders.address.toString());
            console.log(`Base  Free ${openOrders.baseTokenFree.toNumber()} \tTotal: ${openOrders.baseTokenTotal.toNumber()}`);
            console.log(`Quote Free ${openOrders.quoteTokenFree.toNumber()} \tTotal: ${openOrders.quoteTokenFree.toNumber()}`);

            console.log("\n\n\n\n");

            if (openOrders.baseTokenFree.toNumber() > 0 || openOrders.quoteTokenFree.toNumber() > 0) {
                // spl-token accounts to which to send the proceeds from trades
                let baseTokenAccount = new PublicKey(sol_account); // owner.publicKey;
                let quoteTokenAccount = new PublicKey(usdc_account);




                let res = await market.settleFunds(
                    connection,
                    owner,
                    openOrders,
                    baseTokenAccount,
                    quoteTokenAccount,
                );

                console.log(`Settled funds transaction: ${res}`);
            }
        }

        let myOrders = await market.loadOrdersForOwner(connection, owner.publicKey);
        console.log("myOrders");
        myOrders.sort((a, b) => b.price - a.price);

        for (let order of myOrders) {

            console.log(order.orderId.toString(), order.clientId.toString(), order.price, order.size, order.side);

        }

        // console.log("Fills")
        // for (let fill of await market.loadFills(connection)) {
        //     console.log(fill.orderId, fill.price, fill.size, fill.side);
        // }

        // console.log("Cancels")
        // for (let order of myOrders) {
        //     let res = await market.cancelOrder(connection, owner, order);
        //     console.log(res);
        // }

    }, 15000);




    // console.log("Fills")
    // for (let fill of await market.loadFills(connection)) {
    //     console.log(fill.orderId, fill.price, fill.size, fill.side);
    // }

    //     console.log("Cancels")
    //     for (let order of myOrders) {
    //         let res = await market.cancelOrder(connection, owner, order);
    //         console.log(res);
    //     }
}


main();



function sortBidsAsks(bids, asks): any {
    let sortedBids = bids.getL2(7);
    let sortedAsks = asks.getL2(7).sort((a, b) => b[0] - a[0]);

    return { sortedBids, sortedAsks };
}

function displayOrderBook(bids, asks): void {

    let { sortedBids, sortedAsks } = sortBidsAsks(bids, asks);

    for (let [price, size] of sortedAsks) {
        console.log(price, size);
    }

    console.log("===============================");

    for (let [price, size] of sortedBids) {
        console.log(price, size);
    }
    console.log('\n\n\n\n');

}

async function fetchOrderBook(market: Market) {
    let bids = await market.loadBids(connection);
    let asks = await market.loadAsks(connection);
    return { bids, asks };
}

