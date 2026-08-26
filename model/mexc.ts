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

export interface MexcContractDetail {
  symbol: string;
  apiAllowed: boolean;
  contractSize: number;
  minVol: number;
  maxVol: number;
  volScale: number;
  priceScale: number;
  maxLeverage: number;
}

export interface MexcDetailResponse {
  success: boolean;
  data: MexcContractDetail[];
}

export interface MexcFuturesAssetsResponse {
  success: boolean;
  code?: number;
  data?: Array<{ currency: string; availableBalance: number }>;
}

export interface MexcFuturesPosition {
  positionId: number;
  symbol: string;
  positionType: number;
  openType: number;
  holdVol: number;
  openAvgPrice: number;
  holdAvgPrice: number;
  liquidatePrice: number;
  leverage: number;
  realised: number;
}

export interface MexcFuturesPositionsResponse {
  success: boolean;
  code?: number;
  data?: MexcFuturesPosition[];
}

export interface MexcOrderSubmitResponse {
  success: boolean;
  code?: number;
  data?: number | null;
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