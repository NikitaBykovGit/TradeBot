import crypto from 'node:crypto';
import type {
  BingxBalanceResponse,
  BingxContract,
  BingxContractsResponse,
  BingxPosition,
  BingxPositionsResponse,
  BingxPremiumIndexResponse,
  BingxTickerResponse,
} from '../../model';

const bingxApiKey = process.env.BINGX_API_KEY;
const bingxApiSecret = process.env.BINGX_API_SECRET;
const BINGX_BALANCE_URL = 'https://open-api.bingx.com/openApi/swap/v2/user/balance';
const BINGX_POSITIONS_URL = 'https://open-api.bingx.com/openApi/swap/v2/user/positions';
const BINGX_TICKER_URL = 'https://open-api.bingx.com/openApi/swap/v2/quote/ticker';
const BINGX_CONTRACTS_URL = 'https://open-api.bingx.com/openApi/swap/v2/quote/contracts';
const BINGX_PREMIUM_INDEX_URL = 'https://open-api.bingx.com/openApi/swap/v2/quote/premiumIndex';
const BINGX_LEVERAGE_URL = 'https://open-api.bingx.com/openApi/swap/v2/trade/leverage';
const BINGX_ORDER_URL = 'https://open-api.bingx.com/openApi/swap/v2/trade/order';
const BINGX_CONTRACTS_TTL_MS = 30 * 60_000;

let bingxContractsCache: { data: Map<string, BingxContract>; fetchedAt: number } | null = null;

async function bingxSignedRequest<T>(
  url: string,
  method: 'GET' | 'POST',
  params: Record<string, string> = {},
): Promise<T> {
  if (!bingxApiKey || !bingxApiSecret) {
    throw new Error('BINGX_API_KEY и BINGX_API_SECRET не заданы в .env');
  }

  const query = new URLSearchParams({ ...params, timestamp: String(Date.now()) }).toString();
  const signature = crypto.createHmac('sha256', bingxApiSecret).update(query).digest('hex');

  const res = await fetch(`${url}?${query}&signature=${signature}`, {
    method,
    headers: { 'X-BX-APIKEY': bingxApiKey },
  });

  return (await res.json()) as T;
}

export async function getBingxFuturesBalance(): Promise<number> {
  const body = await bingxSignedRequest<BingxBalanceResponse>(BINGX_BALANCE_URL, 'GET');
  if (body.code !== 0) {
    throw new Error(`Ошибка BingX Futures API: ${body.msg || body.code}`);
  }

  return Number(body.data?.balance?.availableMargin ?? 0);
}

export async function getBingxFuturesPositions(): Promise<BingxPosition[]> {
  const body = await bingxSignedRequest<BingxPositionsResponse>(BINGX_POSITIONS_URL, 'GET');
  if (body.code !== 0) {
    throw new Error(`Ошибка BingX Futures API: ${body.msg || body.code}`);
  }

  return (body.data ?? []).filter((position) => Number(position.positionAmt) !== 0);
}

export async function getBingxContracts(): Promise<Map<string, BingxContract>> {
  if (bingxContractsCache && Date.now() - bingxContractsCache.fetchedAt < BINGX_CONTRACTS_TTL_MS) {
    return bingxContractsCache.data;
  }

  const res = await fetch(BINGX_CONTRACTS_URL);
  const body = (await res.json()) as BingxContractsResponse;
  const contracts = new Map<string, BingxContract>();

  for (const contract of body.data ?? []) {
    contracts.set(contract.symbol, contract);
  }

  bingxContractsCache = { data: contracts, fetchedAt: Date.now() };
  return contracts;
}

export async function getBingxFuturesPrices(): Promise<Map<string, number>> {
  const res = await fetch(BINGX_TICKER_URL);
  const body = (await res.json()) as BingxTickerResponse;
  const prices = new Map<string, number>();

  for (const ticker of body.data ?? []) {
    const price = Number(ticker.lastPrice);
    if (price > 0) {
      prices.set(ticker.symbol.replace('-', '/'), price);
    }
  }

  return prices;
}

export async function getBingxFuturesVolumes(): Promise<Map<string, number>> {
  const res = await fetch(BINGX_TICKER_URL);
  const body = (await res.json()) as BingxTickerResponse;
  const volumes = new Map<string, number>();

  for (const ticker of body.data ?? []) {
    const volume = Number(ticker.quoteVolume);
    if (volume >= 0) {
      volumes.set(ticker.symbol.replace('-', '/'), volume);
    }
  }

  return volumes;
}

export async function getBingxFundingRate(symbol: string): Promise<number> {
  const res = await fetch(`${BINGX_PREMIUM_INDEX_URL}?symbol=${symbol}`);
  const body = (await res.json()) as BingxPremiumIndexResponse;
  if (body.code !== 0 || !body.data) {
    throw new Error(`Ошибка BingX Futures API при получении funding rate: ${body.msg || body.code}`);
  }

  return Number(body.data.lastFundingRate);
}

function computeBingxQuantity(contract: BingxContract, price: number, marginUsdt: number, leverage: number): number {
  const notional = marginUsdt * leverage;
  const scale = 10 ** contract.quantityPrecision;
  let quantity = Math.round((notional / price) * scale) / scale;

  const minByNotional = contract.tradeMinUSDT > 0 ? contract.tradeMinUSDT / price : 0;
  const minQuantity = Math.max(contract.tradeMinQuantity, minByNotional);

  if (quantity < minQuantity) {
    quantity = Math.ceil(minQuantity * scale) / scale;
  }

  return quantity;
}

export async function estimateBingxMargin(
  symbol: string,
  price: number,
  marginUsdt: number,
  leverage: number,
): Promise<number> {
  const contracts = await getBingxContracts();
  const contract = contracts.get(symbol);
  if (!contract) {
    throw new Error(`Нет данных контракта BingX для ${symbol}`);
  }

  const quantity = computeBingxQuantity(contract, price, marginUsdt, leverage);
  return (quantity * price) / leverage;
}

async function setBingxLeverage(symbol: string, positionSide: 'LONG' | 'SHORT', leverage: number): Promise<void> {
  const body = await bingxSignedRequest<{ code: number; msg?: string }>(BINGX_LEVERAGE_URL, 'POST', {
    symbol,
    side: positionSide,
    leverage: String(leverage),
  });

  if (body.code !== 0) {
    throw new Error(`Ошибка BingX Futures API при установке плеча: ${body.msg || body.code}`);
  }
}

async function placeBingxOrder(params: {
  symbol: string;
  side: 'BUY' | 'SELL';
  positionSide: 'LONG' | 'SHORT';
  quantity?: number;
}): Promise<void> {
  const query: Record<string, string> = {
    symbol: params.symbol,
    side: params.side,
    positionSide: params.positionSide,
    type: 'MARKET',
  };
  if (params.quantity !== undefined) {
    query.quantity = String(params.quantity);
  }

  const body = await bingxSignedRequest<{ code: number; msg?: string }>(BINGX_ORDER_URL, 'POST', query);
  if (body.code !== 0) {
    throw new Error(`Ошибка BingX Futures API при отправке ордера: ${body.msg || body.code}`);
  }
}

export async function openBingxFuturesPosition(
  symbol: string,
  side: 'long' | 'short',
  price: number,
  marginUsdt: number,
  leverage: number,
): Promise<{ quantity: number }> {
  const contracts = await getBingxContracts();
  const contract = contracts.get(symbol);
  if (!contract) {
    throw new Error(`Нет данных контракта BingX для ${symbol}`);
  }

  const positionSide = side === 'long' ? 'LONG' : 'SHORT';
  await setBingxLeverage(symbol, positionSide, leverage);

  const quantity = computeBingxQuantity(contract, price, marginUsdt, leverage);
  await placeBingxOrder({
    symbol,
    side: side === 'long' ? 'BUY' : 'SELL',
    positionSide,
    quantity,
  });

  return { quantity };
}

export async function closeBingxFuturesPosition(
  symbol: string,
  side: 'long' | 'short',
  quantity?: number,
): Promise<void> {
  const positionSide = side === 'long' ? 'LONG' : 'SHORT';

  let closeQuantity = quantity;
  if (closeQuantity === undefined) {
    const positions = await getBingxFuturesPositions();
    const position = positions.find((p) => p.symbol === symbol);
    if (!position) {
      throw new Error(`Позиция BingX для ${symbol} не найдена при закрытии`);
    }
    closeQuantity = Math.abs(Number(position.positionAmt));
  }

  await placeBingxOrder({
    symbol,
    side: side === 'long' ? 'SELL' : 'BUY',
    positionSide,
    quantity: closeQuantity,
  });
}
