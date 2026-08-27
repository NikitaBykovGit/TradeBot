import type { Api } from 'node-telegram-bot-api';
import { broadcastToSubscribers } from './subscribers.js';
import { getOpenPosition, setOpenPosition, type OpenArbitragePosition } from './trading-state.js';
import {
  getMexcContractDetails,
  getMexcFuturesBalance,
  getMexcFuturesPositions,
  getMexcFuturesPrices,
  getMexcFundingRate,
  estimateMexcMargin,
  openMexcFuturesPosition,
  closeMexcFuturesPosition,
  getBingxFuturesBalance,
  getBingxFuturesPositions,
  getBingxFuturesPrices,
  getBingxFundingRate,
  estimateBingxMargin,
  openBingxFuturesPosition,
  closeBingxFuturesPosition,
} from '../commands/utilits/index.js';

const TRADE_MARGIN_USDT = 1;
const TRADE_LEVERAGE = 2;
const MARGIN_SAFETY_BUFFER = 1.1;
export const CLOSE_DIFF_THRESHOLD_PERCENT = 0.5;

// Максимально допустимый чистый funding против позиции (в % за один период начисления),
// при превышении которого сделка пропускается — funding платится/начисляется на биржах
// независимо от схождения ценового спреда и может съесть весь профит арбитража.
const MAX_UNFAVORABLE_FUNDING_PERCENT = Number(process.env.ARBITRAGE_MAX_UNFAVORABLE_FUNDING_PERCENT) || 0.5;

// Чтобы не слать повторное уведомление о нехватке баланса на каждом опросе,
// пока пара остаётся лучшим кандидатом на арбитраж — только при первом пропуске.
const marginSkipNotified = new Set<string>();
const fundingSkipNotified = new Set<string>();

function toMexcSymbol(symbol: string): string {
  return symbol.replace('/', '_');
}

function toBingxSymbol(symbol: string): string {
  return symbol.replace('/', '-');
}

export async function openArbitrageTrade(
  api: Api,
  symbol: string,
  mexcPrice: number,
  bingxPrice: number,
): Promise<void> {
  const mexcSymbol = toMexcSymbol(symbol);
  const bingxSymbol = toBingxSymbol(symbol);

  let mexcRequiredMargin: number;
  let bingxRequiredMargin: number;
  let mexcBalance: number;
  let bingxBalance: number;

  try {
    [mexcRequiredMargin, bingxRequiredMargin, mexcBalance, bingxBalance] = await Promise.all([
      estimateMexcMargin(mexcSymbol, mexcPrice, TRADE_MARGIN_USDT, TRADE_LEVERAGE),
      estimateBingxMargin(bingxSymbol, bingxPrice, TRADE_MARGIN_USDT, TRADE_LEVERAGE),
      getMexcFuturesBalance(),
      getBingxFuturesBalance(),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await broadcastToSubscribers(api, `❗ Не удалось проверить контракт/баланс перед арбитражем по ${symbol}: ${message}`);
    return;
  }

  const insufficientMargin =
    mexcBalance < mexcRequiredMargin * MARGIN_SAFETY_BUFFER ||
    bingxBalance < bingxRequiredMargin * MARGIN_SAFETY_BUFFER;

  if (insufficientMargin) {
    if (!marginSkipNotified.has(symbol)) {
      marginSkipNotified.add(symbol);
      await broadcastToSubscribers(
        api,
        `⏭ Арбитраж по ${symbol} пропущен: недостаточно баланса под минимальный лот биржи.\n` +
          `MEXC: нужно ≈${mexcRequiredMargin.toFixed(2)} USDT, доступно ${mexcBalance.toFixed(2)} USDT\n` +
          `BingX: нужно ≈${bingxRequiredMargin.toFixed(2)} USDT, доступно ${bingxBalance.toFixed(2)} USDT`,
      );
    }
    return;
  }
  marginSkipNotified.delete(symbol);

  const mexcIsCheaper = mexcPrice < bingxPrice;
  const mexcSide: 'long' | 'short' = mexcIsCheaper ? 'long' : 'short';
  const bingxSide: 'long' | 'short' = mexcIsCheaper ? 'short' : 'long';
  const longExchange: 'MEXC' | 'BingX' = mexcIsCheaper ? 'MEXC' : 'BingX';
  const shortExchange: 'MEXC' | 'BingX' = mexcIsCheaper ? 'BingX' : 'MEXC';
  const entryLongPrice = mexcIsCheaper ? mexcPrice : bingxPrice;
  const entryShortPrice = mexcIsCheaper ? bingxPrice : mexcPrice;

  let mexcFundingRate: number;
  let bingxFundingRate: number;

  try {
    [mexcFundingRate, bingxFundingRate] = await Promise.all([
      getMexcFundingRate(mexcSymbol),
      getBingxFundingRate(bingxSymbol),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await broadcastToSubscribers(api, `❗ Не удалось проверить funding rate перед арбитражем по ${symbol}: ${message}`);
    return;
  }

  // На шорте funding получаешь, на лонге — платишь (при положительной ставке), поэтому
  // чистый ожидаемый funding за период = ставка биржи шорта минус ставка биржи лонга.
  const shortFundingRate = shortExchange === 'MEXC' ? mexcFundingRate : bingxFundingRate;
  const longFundingRate = longExchange === 'MEXC' ? mexcFundingRate : bingxFundingRate;
  const netFundingPercent = (shortFundingRate - longFundingRate) * 100;

  if (netFundingPercent < -MAX_UNFAVORABLE_FUNDING_PERCENT) {
    if (!fundingSkipNotified.has(symbol)) {
      fundingSkipNotified.add(symbol);
      await broadcastToSubscribers(
        api,
        `⏭ Арбитраж по ${symbol} пропущен: funding сильно невыгоден (${netFundingPercent.toFixed(4)}% за период, лимит -${MAX_UNFAVORABLE_FUNDING_PERCENT}%).\n` +
          `Лонг ${longExchange}: ${(longFundingRate * 100).toFixed(4)}%, шорт ${shortExchange}: ${(shortFundingRate * 100).toFixed(4)}%`,
      );
    }
    return;
  }
  fundingSkipNotified.delete(symbol);

  let mexcOpened = false;
  let bingxOpened = false;

  try {
    await openMexcFuturesPosition(mexcSymbol, mexcSide, mexcPrice, TRADE_MARGIN_USDT, TRADE_LEVERAGE);
    mexcOpened = true;
    await openBingxFuturesPosition(bingxSymbol, bingxSide, bingxPrice, TRADE_MARGIN_USDT, TRADE_LEVERAGE);
    bingxOpened = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (mexcOpened) {
      try {
        const positions = await getMexcFuturesPositions();
        const position = positions.find((p) => p.symbol === mexcSymbol);
        if (position) {
          await closeMexcFuturesPosition(position, mexcPrice);
        }
      } catch (rollbackErr) {
        console.error('Не удалось откатить открытую позицию MEXC:', rollbackErr);
        await broadcastToSubscribers(
          api,
          `❗ КРИТИЧНО: не удалось закрыть незахеджированную позицию MEXC по ${symbol} после сбоя открытия арбитража. Требуется немедленное ручное вмешательство!`,
        );
      }
    }

    if (bingxOpened) {
      try {
        await closeBingxFuturesPosition(bingxSymbol, bingxSide);
      } catch (rollbackErr) {
        console.error('Не удалось откатить открытую позицию BingX:', rollbackErr);
        await broadcastToSubscribers(
          api,
          `❗ КРИТИЧНО: не удалось закрыть незахеджированную позицию BingX по ${symbol} после сбоя открытия арбитража. Требуется немедленное ручное вмешательство!`,
        );
      }
    }

    await broadcastToSubscribers(api, `❗ Не удалось открыть арбитраж по ${symbol}: ${message}. Позиции отменены.`);
    return;
  }

  const position: OpenArbitragePosition = {
    symbol,
    mexcSymbol,
    bingxSymbol,
    longExchange,
    shortExchange,
    entryLongPrice,
    entryShortPrice,
    openedAt: Date.now(),
  };
  setOpenPosition(position);

  await broadcastToSubscribers(
    api,
    `🚀 Открыт арбитраж: ${symbol}\n` +
      `Лонг ${longExchange}: цена входа ≈ ${entryLongPrice}\n` +
      `Шорт ${shortExchange}: цена входа ≈ ${entryShortPrice}\n` +
      `Маржа: ${TRADE_MARGIN_USDT} USDT на каждой бирже, плечо ${TRADE_LEVERAGE}x.\n` +
      `Слежение за остальными парами приостановлено — отслеживается только эта пара до закрытия.`,
  );
}

export async function closeArbitrageTrade(
  api: Api,
  position: OpenArbitragePosition,
  mexcPrice: number,
  bingxPrice: number,
  reason: string,
  resumeTracking = true,
): Promise<void> {
  const mexcSide: 'long' | 'short' = position.longExchange === 'MEXC' ? 'long' : 'short';
  const bingxSide: 'long' | 'short' = position.longExchange === 'BingX' ? 'long' : 'short';

  let profitUsdt = 0;
  const errors: string[] = [];

  try {
    const positions = await getMexcFuturesPositions();
    const mexcPosition = positions.find((p) => p.symbol === position.mexcSymbol);
    if (mexcPosition) {
      const contracts = await getMexcContractDetails();
      const contractSize = contracts.get(position.mexcSymbol)?.contractSize ?? 1;
      const baseQty = mexcPosition.holdVol * contractSize;

      await closeMexcFuturesPosition(mexcPosition, mexcPrice);

      profitUsdt +=
        mexcSide === 'long'
          ? baseQty * (mexcPrice - mexcPosition.holdAvgPrice)
          : baseQty * (mexcPosition.holdAvgPrice - mexcPrice);
    } else {
      errors.push('позиция MEXC не найдена (возможно, уже закрыта)');
    }
  } catch (err) {
    errors.push(`MEXC: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const positions = await getBingxFuturesPositions();
    const bingxPosition = positions.find((p) => p.symbol === position.bingxSymbol);
    if (bingxPosition) {
      const baseQty = Math.abs(Number(bingxPosition.positionAmt));
      const entryPrice = Number(bingxPosition.avgPrice);

      await closeBingxFuturesPosition(position.bingxSymbol, bingxSide, baseQty);

      profitUsdt += bingxSide === 'long' ? baseQty * (bingxPrice - entryPrice) : baseQty * (entryPrice - bingxPrice);
    } else {
      errors.push('позиция BingX не найдена (возможно, уже закрыта)');
    }
  } catch (err) {
    errors.push(`BingX: ${err instanceof Error ? err.message : String(err)}`);
  }

  setOpenPosition(null);

  const lines = [
    `✅ Арбитраж закрыт: ${position.symbol}`,
    `Причина: ${reason}`,
    `Цена закрытия MEXC: ≈ ${mexcPrice}`,
    `Цена закрытия BingX: ≈ ${bingxPrice}`,
    `Оценочная прибыль: ${profitUsdt.toFixed(4)} USDT (без учёта комиссий)`,
  ];
  if (errors.length > 0) {
    lines.push(`❗ Проблемы при закрытии: ${errors.join('; ')}`);
  }
  if (resumeTracking) {
    lines.push('Слежение возобновлено по всем парам.');
  }

  await broadcastToSubscribers(api, lines.join('\n'));
}

export async function tryCloseArbitrageTrade(api: Api, mexcPrice: number, bingxPrice: number): Promise<boolean> {
  const position = getOpenPosition();
  if (!position) return false;

  const diffPercent = (Math.abs(mexcPrice - bingxPrice) / Math.min(mexcPrice, bingxPrice)) * 100;
  if (diffPercent >= CLOSE_DIFF_THRESHOLD_PERCENT) return false;

  await closeArbitrageTrade(
    api,
    position,
    mexcPrice,
    bingxPrice,
    `разница цен опустилась ниже ${CLOSE_DIFF_THRESHOLD_PERCENT}%`,
  );
  return true;
}

export async function forceCloseOpenPosition(api: Api, reason: string): Promise<boolean> {
  const position = getOpenPosition();
  if (!position) return false;

  const [mexcPrices, bingxPrices] = await Promise.all([getMexcFuturesPrices(), getBingxFuturesPrices()]);
  const mexcPrice = mexcPrices.get(position.symbol);
  const bingxPrice = bingxPrices.get(position.symbol);

  if (mexcPrice === undefined || bingxPrice === undefined) {
    throw new Error(`Не удалось получить текущую цену ${position.symbol} для закрытия позиции`);
  }

  await closeArbitrageTrade(api, position, mexcPrice, bingxPrice, reason, false);
  return true;
}
