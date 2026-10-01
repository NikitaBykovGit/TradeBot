export const mexcApiKey = process.env.MEXC_API_KEY;
export const mexcApiSecret = process.env.MEXC_API_SECRET;
export const MEXC_FUTURES_ASSETS_URL = 'https://contract.mexc.com/api/v1/private/account/assets';
export const MEXC_FUTURES_POSITIONS_URL = 'https://contract.mexc.com/api/v1/private/position/open_positions';
export const MEXC_ORDER_SUBMIT_URL = 'https://contract.mexc.com/api/v1/private/order/submit';
export const MEXC_TICKER_URL = 'https://contract.mexc.com/api/v1/contract/ticker';
export const MEXC_DETAIL_URL = 'https://contract.mexc.com/api/v1/contract/detail';
export const MEXC_CONTRACT_DETAIL_TTL_MS = 30 * 60_000;