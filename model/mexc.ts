export interface MexcBalance {
  asset: string;
  free: string;
  locked: string;
}

export interface MexcAccountResponse {
  balances: MexcBalance[];
  msg?: string;
}