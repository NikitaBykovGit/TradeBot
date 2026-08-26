import type { Bot } from 'node-telegram-bot-api';
import { broadcastToSubscribers } from './subscribers.js';
import { getOpenPosition, isTradingEnabled } from './trading-state.js';
import { openArbitrageTrade, tryCloseArbitrageTrade } from './arbitrage-trader.js';
import {
  getMexcFuturesBalance,
  getMexcFuturesPrices,
  getBingxFuturesBalance,
  getBingxFuturesPrices,
} from '../commands/utilits/index.js';

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_THRESHOLD_PERCENT = 2;
const MIN_FUTURES_BALANCE_USDT = 1;

async function getFuturesBalancesInfo(): Promise<string> {
  const [mexcResult, bingxResult] = await Promise.allSettled([getMexcFuturesBalance(), getBingxFuturesBalance()]);

  const lines: string[] = [];

  if (mexcResult.status === 'fulfilled') {
    const belowMin = mexcResult.value < MIN_FUTURES_BALANCE_USDT ? ' ❗ ниже минимума' : '';
    lines.push(`Баланс MEXC: ${mexcResult.value.toFixed(2)} USDT${belowMin}`);
  } else {
    const reason = mexcResult.reason instanceof Error ? mexcResult.reason.message : String(mexcResult.reason);
    lines.push(`❗ Не удалось получить баланс фьючерсов MEXC: ${reason}`);
  }

  if (bingxResult.status === 'fulfilled') {
    const belowMin = bingxResult.value < MIN_FUTURES_BALANCE_USDT ? ' ❗ ниже минимума' : '';
    lines.push(`Баланс BingX: ${bingxResult.value.toFixed(2)} USDT${belowMin}`);
  } else {
    const reason = bingxResult.reason instanceof Error ? bingxResult.reason.message : String(bingxResult.reason);
    lines.push(`❗ Не удалось получить баланс фьючерсов BingX: ${reason}`);
  }

  return lines.join('\n');
}

function formatOpportunityMessage(
  symbol: string,
  mexcPrice: number,
  bingxPrice: number,
  diffPercent: number,
  balancesInfo: string,
): string {
  const cheaperExchange = mexcPrice < bingxPrice ? 'MEXC' : 'BingX';
  return (
    `⚡ Арбитраж на фьючерсах: ${symbol}\n` +
    `MEXC: ${mexcPrice}\n` +
    `BingX: ${bingxPrice}\n` +
    `Разница: ${diffPercent.toFixed(2)}% (дешевле на ${cheaperExchange})\n` +
    balancesInfo
  );
}

export function startArbitrageWatcher(bot: Bot): void {
  const pollIntervalMs = Number(process.env.ARBITRAGE_POLL_INTERVAL_MS) || DEFAULT_POLL_INTERVAL_MS;
  const thresholdPercent = Number(process.env.ARBITRAGE_THRESHOLD_PERCENT) || DEFAULT_THRESHOLD_PERCENT;

  // Копится по символам, чтобы не слать уведомление повторно на каждом опросе,
  // пока разница остаётся выше порога — только когда она впервые его пересекает.
  // Используется только в режиме без активной автоторговли (см. isTradingEnabled).
  const activeSymbols = new Set<string>();
  let isBusy = false;

  setInterval(async () => {
    if (isBusy) return;
    isBusy = true;

    try {
      let mexcPrices: Map<string, number>;
      let bingxPrices: Map<string, number>;

      try {
        [mexcPrices, bingxPrices] = await Promise.all([getMexcFuturesPrices(), getBingxFuturesPrices()]);
      } catch (err) {
        console.error('Ошибка получения цен фьючерсов:', err instanceof Error ? err.message : err);
        return;
      }

      const openPosition = getOpenPosition();

      if (openPosition) {
        const mexcPrice = mexcPrices.get(openPosition.symbol);
        const bingxPrice = bingxPrices.get(openPosition.symbol);

        if (mexcPrice === undefined || bingxPrice === undefined) {
          console.error(`Не удалось получить цены ${openPosition.symbol} для открытой арбитражной позиции.`);
          return;
        }

        await tryCloseArbitrageTrade(bot.api, mexcPrice, bingxPrice);
        return;
      }

      if (isTradingEnabled()) {
        let bestSymbol: string | null = null;
        let bestDiff = 0;
        let bestMexcPrice = 0;
        let bestBingxPrice = 0;

        for (const [symbol, mexcPrice] of mexcPrices) {
          const bingxPrice = bingxPrices.get(symbol);
          if (bingxPrice === undefined) continue;

          const diffPercent = (Math.abs(mexcPrice - bingxPrice) / Math.min(mexcPrice, bingxPrice)) * 100;
          if (diffPercent >= thresholdPercent && diffPercent > bestDiff) {
            bestDiff = diffPercent;
            bestSymbol = symbol;
            bestMexcPrice = mexcPrice;
            bestBingxPrice = bingxPrice;
          }
        }

        if (bestSymbol) {
          await openArbitrageTrade(bot.api, bestSymbol, bestMexcPrice, bestBingxPrice);
        }
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
            const balancesInfo = await getFuturesBalancesInfo();
            await broadcastToSubscribers(
              bot.api,
              formatOpportunityMessage(symbol, mexcPrice, bingxPrice, diffPercent, balancesInfo),
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
    } finally {
      isBusy = false;
    }
  }, pollIntervalMs);

  console.log(
    `Слежение за арбитражем фьючерсов MEXC/BingX включено (порог ${thresholdPercent}%, опрос раз в ${pollIntervalMs / 1000} с).`,
  );
}
