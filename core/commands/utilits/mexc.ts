import crypto from 'node:crypto';
import type {
  MexcContractDetail,
  MexcDetailResponse,
  MexcFuturesAssetsResponse,
  MexcFuturesPosition,
  MexcFuturesPositionsResponse,
  MexcOrderRequest,
  MexcOrderSubmitResponse,
  MexcTickerResponse,
} from '../../model/index.js';
import {
  mexcApiKey,
  mexcApiSecret,
  MEXC_FUTURES_ASSETS_URL,
  MEXC_FUTURES_POSITIONS_URL,
  MEXC_ORDER_SUBMIT_URL,
  MEXC_TICKER_URL,
  MEXC_DETAIL_URL,
  MEXC_CONTRACT_DETAIL_TTL_MS,
} from '../../constants/index.js';

let mexcContractDetailCache: { data: Map<string, MexcContractDetail>; fetchedAt: number } | null = null;

function mexcFuturesSignedHeaders(paramString = ''): Record<string, string> {
  if (!mexcApiKey || !mexcApiSecret) {
    throw new Error('MEXC_API_KEY и MEXC_API_SECRET не заданы в .env');
  }

  const timestamp = String(Date.now());
  const signature = crypto
    .createHmac('sha256', mexcApiSecret)
    .update(`${mexcApiKey}${timestamp}${paramString}`)
    .digest('hex');
  return { ApiKey: mexcApiKey, 'Request-Time': timestamp, Signature: signature };
}

export async function getMexcContractDetails(): Promise<Map<string, MexcContractDetail>> {
  if (mexcContractDetailCache && Date.now() - mexcContractDetailCache.fetchedAt < MEXC_CONTRACT_DETAIL_TTL_MS) {
    return mexcContractDetailCache.data;
  }

  const res = await fetch(MEXC_DETAIL_URL);
  const body = (await res.json()) as MexcDetailResponse;
  const details = new Map<string, MexcContractDetail>();

  for (const contract of body.data ?? []) {
    details.set(contract.symbol, contract);
  }

  mexcContractDetailCache = { data: details, fetchedAt: Date.now() };
  return details;
}

export async function getMexcFuturesPrices(): Promise<Map<string, number>> {
  const [res, details] = await Promise.all([fetch(MEXC_TICKER_URL), getMexcContractDetails()]);
  const body = (await res.json()) as MexcTickerResponse;
  const prices = new Map<string, number>();

  for (const ticker of body.data ?? []) {
    if (!details.get(ticker.symbol)?.apiAllowed) continue;

    const price = Number(ticker.lastPrice);
    if (price > 0) {
      prices.set(ticker.symbol.replace('_', '/'), price);
    }
  }

  return prices;
}

async function submitMexcOrder(order: MexcOrderRequest): Promise<number> {
  const body = JSON.stringify(order);
  const headers = { ...mexcFuturesSignedHeaders(body), 'Content-Type': 'application/json' };

  const res = await fetch(MEXC_ORDER_SUBMIT_URL, { method: 'POST', headers, body });
  const data = (await res.json()) as MexcOrderSubmitResponse;
  if (!data.success || data.data === undefined || data.data === null) {
    throw new Error(`Ошибка MEXC Futures API при отправке ордера (код ${data.code ?? res.status})`);
  }

  return data.data;
}

export async function closeMexcFuturesPosition(position: MexcFuturesPosition, price: number): Promise<number> {
  return submitMexcOrder({
    symbol: position.symbol,
    price,
    vol: position.holdVol,
    side: position.positionType === 1 ? 4 : 2,
    type: 5,
    openType: position.openType === 2 ? 2 : 1,
    positionId: position.positionId,
  });
}

export async function getMexcFuturesBalance(): Promise<number> {
  const res = await fetch(MEXC_FUTURES_ASSETS_URL, { headers: mexcFuturesSignedHeaders() });
  const body = (await res.json()) as MexcFuturesAssetsResponse;
  if (!body.success) {
    throw new Error(`Ошибка MEXC Futures API (код ${body.code ?? res.status})`);
  }

  return (body.data ?? []).find((asset) => asset.currency === 'USDT')?.availableBalance ?? 0;
}

export async function getMexcFuturesPositions(): Promise<MexcFuturesPosition[]> {
  const res = await fetch(MEXC_FUTURES_POSITIONS_URL, { headers: mexcFuturesSignedHeaders() });
  const body = (await res.json()) as MexcFuturesPositionsResponse;
  if (!body.success) {
    throw new Error(`Ошибка MEXC Futures API (код ${body.code ?? res.status})`);
  }

  return body.data ?? [];
}
