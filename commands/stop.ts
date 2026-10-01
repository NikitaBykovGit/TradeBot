import type { Context } from 'node-telegram-bot-api';
import { Command } from './abstract.js';
import { getMexcFuturesPositions, getMexcFuturesPrices, closeMexcFuturesPosition } from './utilits/index.js';

export class Stop extends Command {
  async run(ctx: Context): Promise<void> {
    let positions;
    try {
      positions = await getMexcFuturesPositions();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.reply(`❗ MEXC: не удалось получить позиции (${message})`);
      return;
    }

    if (positions.length === 0) {
      await ctx.reply('Открытых позиций на MEXC нет.');
      return;
    }

    await ctx.reply(`⏳ Закрываю открытые позиции MEXC по рынку (${positions.length})...`);

    const prices = await getMexcFuturesPrices().catch(() => new Map<string, number>());
    const lines: string[] = [];

    for (const position of positions) {
      const side = position.positionType === 1 ? 'LONG' : 'SHORT';
      // Ордер рыночный (type 5), но API требует поле price — передаём текущую цену или цену входа.
      const price = prices.get(position.symbol.replace('_', '/')) ?? position.holdAvgPrice;
      try {
        await closeMexcFuturesPosition(position, price);
        lines.push(`✅ ${position.symbol} ${side} закрыта`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        lines.push(`❗ ${position.symbol} ${side}: не удалось закрыть (${message}) — требуется ручное вмешательство!`);
      }
    }

    await ctx.reply(lines.join('\n'));
  }
}
