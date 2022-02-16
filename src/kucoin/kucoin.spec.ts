require("dotenv").config();

import config from '../../secret.config';
import { AccountType } from './lib/types';

import API2 from 'kucoin-node-api'
import API from 'kucoin-node-sdk'


import { positions, getInsideMarket, transfer } from "./kucoin";

describe('Transfer', () => {


    before('before desc', async () => {
        // runs once before the first test in this block
        console.log('--before');


        // const api = require('kucoin-node-api')

        // const config = {
        //     apiKey: '61fadab864b1fe0001a8a774',
        //     secretKey: '169dc1a7-0388-4b69-85c1-368867403fae',
        //     passphrase: 'Agence99$$',
        //     environment: 'live'
        // }

        API.init(config)



    });

    after(async () => {



    });

    it.skip('insideMarket', () => {

        // console.log(await getInsideMarket("SOL-USDT"));


    });


    it('transfer', async () => {

        /*  
          Inner Transfer
          POST /api/accounts/inner-transfer
          params = {
            clientOid: string
            currency: string,
            from: string
            to: string
            amount: string
          }
        */
        // let params = {
        //     clientOid: "1",
        //     currency: "SOL",
        //     to: "trade",
        //     from: "main",
        //     amount: "2.5"
        // };
        // let res = await API.innerTransfer(params)
        // console.log(res);
        // let position = await positions( "marAccout.1", 'SOL');
        // console.log(position);

        await transfer("SOL", "margin", "main", 2);

    });




});


