import type { Context } from 'node-telegram-bot-api';
import { Command } from './abstract.js';
import { disableTrading, isTradingEnabled, getOpenPosition } from '../core/trading-state.js';
import { forceCloseOpenPosition } from '../core/arbitrage-trader.js';

export class Stop extends Command {
  async run(ctx: Context): Promise<void> {
    const wasEnabled = isTradingEnabled();
    disableTrading();

    if (getOpenPosition()) {
      await ctx.reply('⏳ Автоторговля выключена. Закрываю открытую позицию...');
      try {
        await forceCloseOpenPosition(ctx.api, 'принудительная остановка (/stop)');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await ctx.reply(`❗ Не удалось автоматически закрыть позицию: ${message}. Требуется ручное вмешательство!`);
      }
      return;
    }

    await ctx.reply(wasEnabled ? '🛑 Автоторговля выключена.' : 'Автоторговля и так была выключена.');
  }
}
