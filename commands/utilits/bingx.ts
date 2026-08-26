import crypto from 'node:crypto';
import type { BingxBalanceResponse, BingxPosition, BingxPositionsResponse } from '../../model';

const bingxApiKey = process.env.BINGX_API_KEY;
const bingxApiSecret = process.env.BINGX_API_SECRET;
const BINGX_BALANCE_URL = 'https://open-api.bingx.com/openApi/swap/v2/user/balance';
const BINGX_POSITIONS_URL = 'https://open-api.bingx.com/openApi/swap/v2/user/positions';

async function bingxSignedRequest<T>(url: string): Promise<T> {
  if (!bingxApiKey || !bingxApiSecret) {
    throw new Error('BINGX_API_KEY и BINGX_API_SECRET не заданы в .env');
  }

  const query = `timestamp=${Date.now()}`;
  const signature = crypto.createHmac('sha256', bingxApiSecret).update(query).digest('hex');

  const res = await fetch(`${url}?${query}&signature=${signature}`, {
    headers: { 'X-BX-APIKEY': bingxApiKey },
  });

  return (await res.json()) as T;
}

export async function getBingxFuturesBalance(): Promise<number> {
  const body = await bingxSignedRequest<BingxBalanceResponse>(BINGX_BALANCE_URL);
  if (body.code !== 0) {
    throw new Error(`Ошибка BingX Futures API: ${body.msg || body.code}`);
  }

  return Number(body.data?.balance?.availableMargin ?? 0);
}

export async function getBingxFuturesPositions(): Promise<BingxPosition[]> {
  const body = await bingxSignedRequest<BingxPositionsResponse>(BINGX_POSITIONS_URL);
  if (body.code !== 0) {
    throw new Error(`Ошибка BingX Futures API: ${body.msg || body.code}`);
  }

  return (body.data ?? []).filter((position) => Number(position.positionAmt) !== 0);
}
