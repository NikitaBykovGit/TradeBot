import crypto from 'node:crypto';
import type { MexcAccountResponse, MexcBalance } from '../../model';

const mexcApiKey = process.env.MEXC_API_KEY;
const mexcApiSecret = process.env.MEXC_API_SECRET;

async function getMexcServerTime(): Promise<number> {
  const res = await fetch('https://api.mexc.com/api/v3/time');
  const data = (await res.json()) as { serverTime: number };
  return data.serverTime;
}

async function mexcSignedRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  if (!mexcApiKey || !mexcApiSecret) {
    throw new Error('MEXC_API_KEY и MEXC_API_SECRET не заданы в .env');
  }

  const timestamp = await getMexcServerTime();
  const query = new URLSearchParams({ ...params, timestamp: String(timestamp), recvWindow: '60000' }).toString();
  const signature = crypto.createHmac('sha256', mexcApiSecret).update(query).digest('hex');

  const res = await fetch(`https://api.mexc.com${path}?${query}&signature=${signature}`, {
    method,
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
  const data = await mexcSignedRequest<MexcAccountResponse>('GET', '/api/v3/account');
  return data.balances.filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
}

export async function createListenKey(): Promise<string> {
  const data = await mexcSignedRequest<{ listenKey: string }>('POST', '/api/v3/userDataStream');
  return data.listenKey;
}

export async function keepAliveListenKey(listenKey: string): Promise<void> {
  await mexcSignedRequest('PUT', '/api/v3/userDataStream', { listenKey });
}

export async function closeListenKey(listenKey: string): Promise<void> {
  await mexcSignedRequest('DELETE', '/api/v3/userDataStream', { listenKey });
}
