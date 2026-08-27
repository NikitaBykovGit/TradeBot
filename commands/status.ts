import type { Context } from 'node-telegram-bot-api';
import { Command } from './abstract.js';
import {
  getMexcFuturesPositions,
  getBingxFuturesPositions,
  getMexcFuturesPrices,
  getBingxFuturesPrices,
  getMexcContractDetails,
} from './utilits/index.js';
import type { MexcFuturesPosition, BingxPosition } from '../model';
import { getOpenPosition, type OpenArbitragePosition } from '../core/trading-state.js';

function formatMexcPosition(position: MexcFuturesPosition, prices: Map<string, number>): string {
  const side = position.positionType === 1 ? 'LONG' : 'SHORT';
  const price = prices.get(position.symbol.replace('_', '/'));
  const priceText = price !== undefined ? ` | Текущая цена: ${price}` : '';
  return (
    `${position.symbol} ${side}\n` +
    `Объём: ${position.holdVol} | Вход: ${position.holdAvgPrice} | Плечо: ${position.leverage}x | ` +
    `Ликвидация: ${position.liquidatePrice}${priceText}`
  );
}

function formatBingxPosition(position: BingxPosition, prices: Map<string, number>): string {
  const price = prices.get(position.symbol.replace('-', '/'));
  const priceText = price !== undefined ? ` | Текущая цена: ${price}` : '';
  return (
    `${position.symbol} ${position.positionSide}\n` +
    `Объём: ${position.positionAmt} | Вход: ${position.avgPrice} | Плечо: ${position.leverage}x | ` +
    `PnL: ${position.unrealizedProfit} USDT | Ликвидация: ${position.liquidationPrice}${priceText}`
  );
}

function calculateArbitrageClosePnl(
  position: OpenArbitragePosition,
  mexcPositions: MexcFuturesPosition[],
  bingxPositions: BingxPosition[],
  mexcContractSize: number,
  mexcPrice: number | undefined,
  bingxPrice: number | undefined,
): { pnl: number; missing: string[] } {
  const mexcSide: 'long' | 'short' = position.longExchange === 'MEXC' ? 'long' : 'short';
  const bingxSide: 'long' | 'short' = position.longExchange === 'BingX' ? 'long' : 'short';

  let pnl = 0;
  const missing: string[] = [];

  const mexcPosition = mexcPositions.find((p) => p.symbol === position.mexcSymbol);
  if (mexcPosition && mexcPrice !== undefined) {
    const baseQty = mexcPosition.holdVol * mexcContractSize;
    pnl +=
      mexcSide === 'long'
        ? baseQty * (mexcPrice - mexcPosition.holdAvgPrice)
        : baseQty * (mexcPosition.holdAvgPrice - mexcPrice);
  } else {
    missing.push('MEXC');
  }

  const bingxPosition = bingxPositions.find((p) => p.symbol === position.bingxSymbol);
  if (bingxPosition && bingxPrice !== undefined) {
    const baseQty = Math.abs(Number(bingxPosition.positionAmt));
    const entryPrice = Number(bingxPosition.avgPrice);
    pnl += bingxSide === 'long' ? baseQty * (bingxPrice - entryPrice) : baseQty * (entryPrice - bingxPrice);
  } else {
    missing.push('BingX');
  }

  return { pnl, missing };
}

export class Status extends Command {
  async run(ctx: Context): Promise<void> {
    const openPosition = getOpenPosition();

    const [mexcResult, bingxResult, mexcPricesResult, bingxPricesResult, mexcContractsResult] =
      await Promise.allSettled([
        getMexcFuturesPositions(),
        getBingxFuturesPositions(),
        getMexcFuturesPrices(),
        getBingxFuturesPrices(),
        openPosition ? getMexcContractDetails() : Promise.resolve(new Map()),
      ]);

    const mexcPrices = mexcPricesResult.status === 'fulfilled' ? mexcPricesResult.value : new Map<string, number>();
    const bingxPrices = bingxPricesResult.status === 'fulfilled' ? bingxPricesResult.value : new Map<string, number>();

    const sections: string[] = [];

    if (mexcResult.status === 'fulfilled') {
      const text =
        mexcResult.value.length === 0
          ? 'нет открытых позиций'
          : mexcResult.value.map((position) => formatMexcPosition(position, mexcPrices)).join('\n\n');
      sections.push(`MEXC:\n${text}`);
    } else {
      const message = mexcResult.reason instanceof Error ? mexcResult.reason.message : String(mexcResult.reason);
      sections.push(`❗ MEXC: не удалось получить позиции (${message})`);
    }

    if (bingxResult.status === 'fulfilled') {
      const text =
        bingxResult.value.length === 0
          ? 'нет открытых позиций'
          : bingxResult.value.map((position) => formatBingxPosition(position, bingxPrices)).join('\n\n');
      sections.push(`BingX:\n${text}`);
    } else {
      const message = bingxResult.reason instanceof Error ? bingxResult.reason.message : String(bingxResult.reason);
      sections.push(`❗ BingX: не удалось получить позиции (${message})`);
    }

    if (openPosition) {
      if (mexcResult.status === 'fulfilled' && bingxResult.status === 'fulfilled') {
        const mexcContractSize =
          mexcContractsResult.status === 'fulfilled'
            ? (mexcContractsResult.value.get(openPosition.mexcSymbol)?.contractSize ?? 1)
            : 1;
        const { pnl, missing } = calculateArbitrageClosePnl(
          openPosition,
          mexcResult.value,
          bingxResult.value,
          mexcContractSize,
          mexcPrices.get(openPosition.symbol),
          bingxPrices.get(openPosition.symbol),
        );

        if (missing.length === 0) {
          sections.push(`💰 PnL при закрытии сейчас (/stop): ${pnl.toFixed(4)} USDT (без учёта комиссий)`);
        } else {
          sections.push(`💰 PnL при закрытии сейчас: не удалось оценить (нет данных: ${missing.join(', ')})`);
        }
      } else {
        sections.push('💰 PnL при закрытии сейчас: не удалось оценить (нет данных о позициях)');
      }
    }

    await ctx.reply(sections.join('\n\n'));
  }
}
