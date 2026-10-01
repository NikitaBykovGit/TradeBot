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
