import bunyan from 'bunyan';

let _log = bunyan.createLogger({
  name: 'zeta',
  streams: [
    {
      level: 'info',
      stream: process.stdout,
    },
    {
      level: 'error',
      path: '.\\logs\\errors.log'
    }
  ]
});

let _orderLog = bunyan.createLogger({
  name: 'zeta',
  streams: [
    {
      level: 'info',
      path: '.\\logs\\orders.log'
    }
  ]
});

export interface HedgerIfc {
  adjustSpotLongs(desiredSize: number, options: OptionsIfc);
}

export interface ConfigurationIfc {
  loadHedger(): string[];
  loadActions(): string[];
  loadSnipers(): string[];
  loadOptionsForAction(actionName: String, defaultOptions: Object): OptionsIfc
}

export interface OptionsIfc {
  deltaNeutralPosition?: number,
  minBuySize?: number,
  minSellSize?: number,
  marketIndex?: number,
  crossMkt?: boolean,
  fairMarketPriceSpread?: number,
  size?: number,
  minAvailableBalanceForOrder?: number,
  minPrice?: number,
  maxPrice?: number,
  offlineSize?: number,
  marginAccount?: number
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function info(msg: any) {
  _log.info(msg);
}

export function error(error: any) {
  _log.error(error);
}

export function logOrder(msg: any) {
  _orderLog.info(msg);
}