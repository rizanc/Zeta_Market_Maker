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

import { optionsIfc } from "../../configuration";

const FAIR_MARKET_PRICE_SPREAD: number = parseFloat(process.env["FAIR_MARKET_PRICE_SPREAD"]) || 0.01;

export interface HedgerIfc {
  adjustSpotLongs(desiredSize: number, options: optionsIfc);
}

