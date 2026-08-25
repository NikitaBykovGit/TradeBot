export interface BingxTickerResponse {
  code: number;
  data: Array<{ symbol: string; lastPrice: string }>;
}
