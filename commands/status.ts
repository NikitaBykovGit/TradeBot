import type { Context } from 'node-telegram-bot-api';
import { Command } from './abstract.js';
import { getMexcFuturesPositions, getMexcFuturesPrices } from './utilits/index.js';
import type { MexcFuturesPosition } from '../model';

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

export class Status extends Command {
  async run(ctx: Context): Promise<void> {
    const [positionsResult, pricesResult] = await Promise.allSettled([
      getMexcFuturesPositions(),
      getMexcFuturesPrices(),
    ]);

    if (positionsResult.status === 'rejected') {
      const reason = positionsResult.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      await ctx.reply(`❗ MEXC: не удалось получить позиции (${message})`);
      return;
    }

    const prices = pricesResult.status === 'fulfilled' ? pricesResult.value : new Map<string, number>();
    const text =
      positionsResult.value.length === 0
        ? 'нет открытых позиций'
        : positionsResult.value.map((position) => formatMexcPosition(position, prices)).join('\n\n');

    await ctx.reply(`Открытые позиции MEXC:\n${text}`);
  }
}
