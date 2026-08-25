import crypto from 'node:crypto';
import type { Bot } from 'node-telegram-bot-api';
import { getSubscribers } from './subscribers.js';
import type {
  MexcTickerResponse,
  MexcDetailResponse,
  MexcFuturesAssetsResponse,
  BingxTickerResponse,
  BingxBalanceResponse,
} from '../model';

const MEXC_TICKER_URL = 'https://contract.mexc.com/api/v1/contract/ticker';
const MEXC_DETAIL_URL = 'https://contract.mexc.com/api/v1/contract/detail';
const MEXC_ASSETS_URL = 'https://contract.mexc.com/api/v1/private/account/assets';
const BINGX_TICKER_URL = 'https://open-api.bingx.com/openApi/swap/v2/quote/ticker';
const BINGX_BALANCE_URL = 'https://open-api.bingx.com/openApi/swap/v2/user/balance';
const DEFAULT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_THRESHOLD_PERCENT = 2;
const MEXC_ALLOWED_SYMBOLS_TTL_MS = 30 * 60_000;
const MIN_FUTURES_BALANCE_USDT = 1;

const mexcApiKey = process.env.MEXC_API_KEY;
const mexcApiSecret = process.env.MEXC_API_SECRET;
const bingxApiKey = process.env.BINGX_API_KEY;
const bingxApiSecret = process.env.BINGX_API_SECRET;

let mexcAllowedSymbolsCache: { symbols: Set<string>; fetchedAt: number } | null = null;

async function fetchMexcAllowedSymbols(): Promise<Set<string>> {
  if (mexcAllowedSymbolsCache && Date.now() - mexcAllowedSymbolsCache.fetchedAt < MEXC_ALLOWED_SYMBOLS_TTL_MS) {
    return mexcAllowedSymbolsCache.symbols;
  }

  const res = await fetch(MEXC_DETAIL_URL);
  const body = (await res.json()) as MexcDetailResponse;
  const symbols = new Set<string>();

  for (const contract of body.data ?? []) {
    if (contract.apiAllowed) {
      symbols.add(contract.symbol);
    }
  }

  mexcAllowedSymbolsCache = { symbols, fetchedAt: Date.now() };
  return symbols;
}

async function fetchMexcFuturesPrices(): Promise<Map<string, number>> {
  const [res, allowedSymbols] = await Promise.all([fetch(MEXC_TICKER_URL), fetchMexcAllowedSymbols()]);
  const body = (await res.json()) as MexcTickerResponse;
  const prices = new Map<string, number>();

  for (const ticker of body.data ?? []) {
    if (!allowedSymbols.has(ticker.symbol)) continue;

    const price = Number(ticker.lastPrice);
    if (price > 0) {
      prices.set(ticker.symbol.replace('_', '/'), price);
    }
  }

  return prices;
}

async function fetchBingxFuturesPrices(): Promise<Map<string, number>> {
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

async function fetchMexcFuturesUsdtBalance(): Promise<number> {
  if (!mexcApiKey || !mexcApiSecret) {
    throw new Error('MEXC_API_KEY и MEXC_API_SECRET не заданы в .env');
  }

  const timestamp = String(Date.now());
  const signature = crypto.createHmac('sha256', mexcApiSecret).update(`${mexcApiKey}${timestamp}`).digest('hex');

  const res = await fetch(MEXC_ASSETS_URL, {
    headers: { ApiKey: mexcApiKey, 'Request-Time': timestamp, Signature: signature },
  });

  const body = (await res.json()) as MexcFuturesAssetsResponse;
  if (!body.success) {
    throw new Error(`Ошибка MEXC Futures API (код ${body.code ?? res.status})`);
  }

  return (body.data ?? []).find((asset) => asset.currency === 'USDT')?.availableBalance ?? 0;
}

async function fetchBingxFuturesUsdtBalance(): Promise<number> {
  if (!bingxApiKey || !bingxApiSecret) {
    throw new Error('BINGX_API_KEY и BINGX_API_SECRET не заданы в .env');
  }

  const query = `timestamp=${Date.now()}`;
  const signature = crypto.createHmac('sha256', bingxApiSecret).update(query).digest('hex');

  const res = await fetch(`${BINGX_BALANCE_URL}?${query}&signature=${signature}`, {
    headers: { 'X-BX-APIKEY': bingxApiKey },
  });

  const body = (await res.json()) as BingxBalanceResponse;
  if (body.code !== 0) {
    throw new Error(`Ошибка BingX Futures API: ${body.msg || body.code}`);
  }

  return Number(body.data?.balance?.availableMargin ?? 0);
}

async function checkFuturesBalanceWarning(): Promise<string | null> {
  const [mexcResult, bingxResult] = await Promise.allSettled([
    fetchMexcFuturesUsdtBalance(),
    fetchBingxFuturesUsdtBalance(),
  ]);

  const warnings: string[] = [];

  if (mexcResult.status === 'fulfilled') {
    if (mexcResult.value < MIN_FUTURES_BALANCE_USDT) {
      warnings.push(`❗ Баланс фьючерсов MEXC ниже ${MIN_FUTURES_BALANCE_USDT} USDT: ${mexcResult.value.toFixed(2)} USDT`);
    }
  } else {
    const reason = mexcResult.reason instanceof Error ? mexcResult.reason.message : String(mexcResult.reason);
    warnings.push(`❗ Не удалось проверить баланс фьючерсов MEXC: ${reason}`);
  }

  if (bingxResult.status === 'fulfilled') {
    if (bingxResult.value < MIN_FUTURES_BALANCE_USDT) {
      warnings.push(`❗ Баланс фьючерсов BingX ниже ${MIN_FUTURES_BALANCE_USDT} USDT: ${bingxResult.value.toFixed(2)} USDT`);
    }
  } else {
    const reason = bingxResult.reason instanceof Error ? bingxResult.reason.message : String(bingxResult.reason);
    warnings.push(`❗ Не удалось проверить баланс фьючерсов BingX: ${reason}`);
  }

  return warnings.length > 0 ? warnings.join('\n') : null;
}

function formatOpportunityMessage(
  symbol: string,
  mexcPrice: number,
  bingxPrice: number,
  diffPercent: number,
  balanceWarning: string | null,
): string {
  const cheaperExchange = mexcPrice < bingxPrice ? 'MEXC' : 'BingX';
  const message =
    `⚡ Арбитраж на фьючерсах: ${symbol}\n` +
    `MEXC: ${mexcPrice}\n` +
    `BingX: ${bingxPrice}\n` +
    `Разница: ${diffPercent.toFixed(2)}% (дешевле на ${cheaperExchange})`;

  return balanceWarning ? `${message}\n${balanceWarning}` : message;
}

async function notifySubscribers(bot: Bot, text: string): Promise<void> {
  const chatIds = await getSubscribers();

  for (const chatId of chatIds) {
    try {
      await bot.api.sendMessage({ chat_id: chatId, text });
    } catch (err) {
      console.error(`Не удалось отправить уведомление в чат ${chatId}:`, err instanceof Error ? err.message : err);
    }
  }
}

export function startArbitrageWatcher(bot: Bot): void {
  const pollIntervalMs = Number(process.env.ARBITRAGE_POLL_INTERVAL_MS) || DEFAULT_POLL_INTERVAL_MS;
  const thresholdPercent = Number(process.env.ARBITRAGE_THRESHOLD_PERCENT) || DEFAULT_THRESHOLD_PERCENT;

  // Копится по символам, чтобы не слать уведомление повторно на каждом опросе,
  // пока разница остаётся выше порога — только когда она впервые его пересекает.
  const activeSymbols = new Set<string>();

  setInterval(async () => {
    let mexcPrices: Map<string, number>;
    let bingxPrices: Map<string, number>;

    try {
      [mexcPrices, bingxPrices] = await Promise.all([fetchMexcFuturesPrices(), fetchBingxFuturesPrices()]);
    } catch (err) {
      console.error('Ошибка получения цен фьючерсов:', err instanceof Error ? err.message : err);
      return;
    }

    const seenSymbols = new Set<string>();

    for (const [symbol, mexcPrice] of mexcPrices) {
      const bingxPrice = bingxPrices.get(symbol);
      if (bingxPrice === undefined) continue;

      seenSymbols.add(symbol);
      const diffPercent = (Math.abs(mexcPrice - bingxPrice) / Math.min(mexcPrice, bingxPrice)) * 100;

      if (diffPercent >= thresholdPercent) {
        if (!activeSymbols.has(symbol)) {
          activeSymbols.add(symbol);
          const balanceWarning = await checkFuturesBalanceWarning();
          await notifySubscribers(
            bot,
            formatOpportunityMessage(symbol, mexcPrice, bingxPrice, diffPercent, balanceWarning),
          );
        }
      } else {
        activeSymbols.delete(symbol);
      }
    }

    for (const symbol of activeSymbols) {
      if (!seenSymbols.has(symbol)) {
        activeSymbols.delete(symbol);
      }
    }
  }, pollIntervalMs);

  console.log(
    `Слежение за арбитражем фьючерсов MEXC/BingX включено (порог ${thresholdPercent}%, опрос раз в ${pollIntervalMs / 1000} с).`,
  );
}
