import type { Context } from 'node-telegram-bot-api';
import { Command } from './abstract.js';
import {
  getMexcFuturesPositions,
  getBingxFuturesPositions,
  getMexcFuturesPrices,
  getBingxFuturesPrices,
} from './utilits/index.js';
import type { MexcFuturesPosition, BingxPosition } from '../model';

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

export class Status extends Command {
  async run(ctx: Context): Promise<void> {
    const [mexcResult, bingxResult, mexcPricesResult, bingxPricesResult] = await Promise.allSettled([
      getMexcFuturesPositions(),
      getBingxFuturesPositions(),
      getMexcFuturesPrices(),
      getBingxFuturesPrices(),
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

    await ctx.reply(sections.join('\n\n'));
  }
}
