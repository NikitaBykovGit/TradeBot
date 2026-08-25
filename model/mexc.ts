export interface MexcBalance {
  asset: string;
  free: string;
  locked: string;
}

export interface MexcAccountResponse {
  balances: MexcBalance[];
  msg?: string;
}

export interface MexcTrade {
  id: string;
  orderId: string;
  symbol: string;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
  isMaker: boolean;
}

export interface MexcTickerResponse {
  success: boolean;
  data: Array<{ symbol: string; lastPrice: number }>;
}

export interface MexcDetailResponse {
  success: boolean;
  data: Array<{ symbol: string; apiAllowed: boolean }>;
}

export interface MexcFuturesAssetsResponse {
  success: boolean;
  code?: number;
  data?: Array<{ currency: string; availableBalance: number }>;
}

export interface MexcPrivateDealsPayload {
  price: string;
  quantity: string;
  amount: string;
  tradeType: number;
  isMaker: boolean;
  tradeId: string;
  orderId: string;
  feeAmount: string;
  feeCurrency: string;
  time: number;
}

export interface MexcPushDataWrapperPayload {
  channel: string;
  symbol?: string;
  privateDeals?: MexcPrivateDealsPayload;
}