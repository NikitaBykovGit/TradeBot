export interface BingxTickerResponse {
  code: number;
  data: Array<{ symbol: string; lastPrice: string; quoteVolume: string }>;
}

export interface BingxBalanceResponse {
  code: number;
  msg?: string;
  data?: {
    balance?: {
      asset: string;
      balance: string;
      availableMargin: string;
    };
  };
}

export interface BingxPosition {
  positionId: string;
  symbol: string;
  positionSide: string;
  isolated: boolean;
  positionAmt: string;
  avgPrice: string;
  leverage: number;
  unrealizedProfit: string;
  liquidationPrice: number;
}

export interface BingxPositionsResponse {
  code: number;
  msg?: string;
  data?: BingxPosition[];
}

export interface BingxPremiumIndexResponse {
  code: number;
  msg?: string;
  data?: {
    symbol: string;
    lastFundingRate: string;
    nextFundingTime: number;
  };
}

export interface BingxContract {
  symbol: string;
  quantityPrecision: number;
  pricePrecision: number;
  tradeMinQuantity: number;
  tradeMinUSDT: number;
}

export interface BingxContractsResponse {
  code: number;
  msg?: string;
  data?: BingxContract[];
}
