import type { Context } from 'node-telegram-bot-api';
import { Command } from './abstract.js';
import { getMexcFuturesBalance } from './utilits/index.js';

export class Balance extends Command {
  async run(ctx: Context): Promise<void> {
    try {
      const balance = await getMexcFuturesBalance();
      await ctx.reply(`Баланс фьючерсов MEXC: ${balance.toFixed(2)} USDT`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.reply(`❗ MEXC: не удалось получить баланс (${message})`);
    }
  }
}
