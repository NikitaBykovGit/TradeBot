import type { Bot } from 'node-telegram-bot-api';
import { getOpenPosition, isTradingEnabled } from './trading-state.js';
import { openArbitrageTrade, tryCloseArbitrageTrade } from './arbitrage-trader.js';
import {
  getMexcFuturesPrices,
  getBingxFuturesPrices,
  getMexcFuturesVolumes,
  getBingxFuturesVolumes,
} from '../commands/utilits/index.js';
import { ARBITRAGE_MIN_VOLUME_USDT } from './config.js';

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_THRESHOLD_PERCENT = 2;

export function startArbitrageWatcher(bot: Bot): void {
  const pollIntervalMs = Number(process.env.ARBITRAGE_POLL_INTERVAL_MS) || DEFAULT_POLL_INTERVAL_MS;
  const thresholdPercent = Number(process.env.ARBITRAGE_THRESHOLD_PERCENT) || DEFAULT_THRESHOLD_PERCENT;

  let isBusy = false;

  setInterval(async () => {
    if (isBusy) return;
    isBusy = true;

    try {
      const openPosition = getOpenPosition();

      if (!openPosition && !isTradingEnabled()) return;

      let mexcPrices: Map<string, number>;
      let bingxPrices: Map<string, number>;

      try {
        [mexcPrices, bingxPrices] = await Promise.all([getMexcFuturesPrices(), getBingxFuturesPrices()]);
      } catch (err) {
        console.error('Ошибка получения цен фьючерсов:', err instanceof Error ? err.message : err);
        return;
      }

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

      let mexcVolumes: Map<string, number>;
      let bingxVolumes: Map<string, number>;

      try {
        [mexcVolumes, bingxVolumes] = await Promise.all([getMexcFuturesVolumes(), getBingxFuturesVolumes()]);
      } catch (err) {
        console.error('Ошибка получения объёмов фьючерсов:', err instanceof Error ? err.message : err);
        return;
      }

      let bestSymbol: string | null = null;
      let bestDiff = 0;
      let bestMexcPrice = 0;
      let bestBingxPrice = 0;

      for (const [symbol, mexcPrice] of mexcPrices) {
        const bingxPrice = bingxPrices.get(symbol);
        if (bingxPrice === undefined) continue;

        const mexcVolume = mexcVolumes.get(symbol) ?? 0;
        const bingxVolume = bingxVolumes.get(symbol) ?? 0;
        if (mexcVolume < ARBITRAGE_MIN_VOLUME_USDT || bingxVolume < ARBITRAGE_MIN_VOLUME_USDT) continue;

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
    } finally {
      isBusy = false;
    }
  }, pollIntervalMs);

  console.log(
    `Слежение за арбитражем фьючерсов MEXC/BingX включено (порог ${thresholdPercent}%, ` +
      `мин. суточный объём ${ARBITRAGE_MIN_VOLUME_USDT} USDT, опрос раз в ${pollIntervalMs / 1000} с).`,
  );
}
