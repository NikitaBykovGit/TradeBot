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
