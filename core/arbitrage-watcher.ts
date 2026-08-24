import type { Bot } from 'node-telegram-bot-api';
import { getSubscribers } from './subscribers.js';

const MEXC_TICKER_URL = 'https://contract.mexc.com/api/v1/contract/ticker';
const BINGX_TICKER_URL = 'https://open-api.bingx.com/openApi/swap/v2/quote/ticker';
const DEFAULT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_THRESHOLD_PERCENT = 1;

interface MexcTickerResponse {
  success: boolean;
  data: Array<{ symbol: string; lastPrice: number }>;
}

interface BingxTickerResponse {
  code: number;
  data: Array<{ symbol: string; lastPrice: string }>;
}

async function fetchMexcFuturesPrices(): Promise<Map<string, number>> {
  const res = await fetch(MEXC_TICKER_URL);
  const body = (await res.json()) as MexcTickerResponse;
  const prices = new Map<string, number>();

  for (const ticker of body.data ?? []) {
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

function formatOpportunityMessage(symbol: string, mexcPrice: number, bingxPrice: number, diffPercent: number): string {
  const cheaperExchange = mexcPrice < bingxPrice ? 'MEXC' : 'BingX';
  return (
    `⚡ Арбитраж на фьючерсах: ${symbol}\n` +
    `MEXC: ${mexcPrice}\n` +
    `BingX: ${bingxPrice}\n` +
    `Разница: ${diffPercent.toFixed(2)}% (дешевле на ${cheaperExchange})`
  );
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
          await notifySubscribers(bot, formatOpportunityMessage(symbol, mexcPrice, bingxPrice, diffPercent));
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
