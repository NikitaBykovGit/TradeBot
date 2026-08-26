export interface BingxTickerResponse {
  code: number;
  data: Array<{ symbol: string; lastPrice: string }>;
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
