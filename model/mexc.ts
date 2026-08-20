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