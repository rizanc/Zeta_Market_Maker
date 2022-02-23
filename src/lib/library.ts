export interface HedgerIfc {
  adjustSpotLongs(desiredSize: number, options: OptionsIfc);
}

export interface ConfigurationIfc {
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
  maxPrice?: number
}