import type { Context } from 'node-telegram-bot-api';
import { Command } from './abstract.js';
import { enableTrading, isTradingEnabled } from '../core/trading-state.js';
import { CLOSE_DIFF_THRESHOLD_PERCENT } from '../core/arbitrage-trader.js';

export class Trade extends Command {
  async run(ctx: Context): Promise<void> {
    if (isTradingEnabled()) {
      await ctx.reply('Автоторговля уже включена.');
      return;
    }

    enableTrading();
    await ctx.reply(
      '✅ Автоторговля включена.\n' +
        'При обнаружении арбитражной возможности бот откроет лонг на более дешёвой бирже и шорт на более дорогой ' +
        `(маржа 1 USDT, плечо 2x на каждой), а после схождения цен (разница < ${CLOSE_DIFF_THRESHOLD_PERCENT}%) закроет обе позиции.\n` +
        'Пока позиция открыта, слежение за остальными парами приостановлено. Чтобы остановить — /stop.',
    );
  }
}
