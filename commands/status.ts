import type { Context } from 'node-telegram-bot-api';
import { Command } from './abstract.js';
import { getMexcFuturesPositions, getBingxFuturesPositions } from './utilits/index.js';
import type { MexcFuturesPosition, BingxPosition } from '../model';

function formatMexcPosition(position: MexcFuturesPosition): string {
  const side = position.positionType === 1 ? 'LONG' : 'SHORT';
  return (
    `${position.symbol} ${side}\n` +
    `Объём: ${position.holdVol} | Вход: ${position.holdAvgPrice} | Плечо: ${position.leverage}x | ` +
    `Ликвидация: ${position.liquidatePrice}`
  );
}

function formatBingxPosition(position: BingxPosition): string {
  return (
    `${position.symbol} ${position.positionSide}\n` +
    `Объём: ${position.positionAmt} | Вход: ${position.avgPrice} | Плечо: ${position.leverage}x | ` +
    `PnL: ${position.unrealizedProfit} USDT | Ликвидация: ${position.liquidationPrice}`
  );
}

export class Status extends Command {
  async run(ctx: Context): Promise<void> {
    const [mexcResult, bingxResult] = await Promise.allSettled([
      getMexcFuturesPositions(),
      getBingxFuturesPositions(),
    ]);

    const sections: string[] = [];

    if (mexcResult.status === 'fulfilled') {
      const text =
        mexcResult.value.length === 0 ? 'нет открытых позиций' : mexcResult.value.map(formatMexcPosition).join('\n\n');
      sections.push(`MEXC:\n${text}`);
    } else {
      const message = mexcResult.reason instanceof Error ? mexcResult.reason.message : String(mexcResult.reason);
      sections.push(`❗ MEXC: не удалось получить позиции (${message})`);
    }

    if (bingxResult.status === 'fulfilled') {
      const text =
        bingxResult.value.length === 0 ? 'нет открытых позиций' : bingxResult.value.map(formatBingxPosition).join('\n\n');
      sections.push(`BingX:\n${text}`);
    } else {
      const message = bingxResult.reason instanceof Error ? bingxResult.reason.message : String(bingxResult.reason);
      sections.push(`❗ BingX: не удалось получить позиции (${message})`);
    }

    await ctx.reply(sections.join('\n\n'));
  }
}
