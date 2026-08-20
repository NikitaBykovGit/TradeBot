import crypto from 'node:crypto';
import type { MexcAccountResponse, MexcBalance, MexcTrade } from '../../model';

const mexcApiKey = process.env.MEXC_API_KEY;
const mexcApiSecret = process.env.MEXC_API_SECRET;

async function getMexcServerTime(): Promise<number> {
  const res = await fetch('https://api.mexc.com/api/v3/time');
  const data = (await res.json()) as { serverTime: number };
  return data.serverTime;
}

async function mexcSignedGet<T>(path: string, params: Record<string, string>): Promise<T> {
  if (!mexcApiKey || !mexcApiSecret) {
    throw new Error('MEXC_API_KEY и MEXC_API_SECRET не заданы в .env');
  }

  const timestamp = await getMexcServerTime();
  const query = new URLSearchParams({ ...params, timestamp: String(timestamp), recvWindow: '60000' }).toString();
  const signature = crypto.createHmac('sha256', mexcApiSecret).update(query).digest('hex');

  const res = await fetch(`https://api.mexc.com${path}?${query}&signature=${signature}`, {
    headers: { 'X-MEXC-APIKEY': mexcApiKey },
  });

  const data = (await res.json()) as T;
  if (!res.ok) {
    const message = (data as { msg?: string })?.msg;
    throw new Error(message || `Ошибка MEXC API (${res.status})`);
  }

  return data;
}

export async function getMexcBalance(): Promise<MexcBalance[]> {
  const data = await mexcSignedGet<MexcAccountResponse>('/api/v3/account', {});
  return data.balances.filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
}

export async function getMexcTrades(symbol: string, startTime?: number): Promise<MexcTrade[]> {
  const params: Record<string, string> = { symbol, limit: '100' };
  if (startTime !== undefined) {
    params.startTime = String(startTime);
  }

  return mexcSignedGet<MexcTrade[]>('/api/v3/myTrades', params);
}
