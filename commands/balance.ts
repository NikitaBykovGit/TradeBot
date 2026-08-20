import type { Context } from 'node-telegram-bot-api';
import { Command } from './abstract.js';
import { getMexcBalance } from './utilits/index.js';

export class Balance extends Command {
  async run(ctx: Context): Promise<void> {
    try {
      const balances = await getMexcBalance();
      if (balances.length === 0) {
        await ctx.reply('Баланс пуст.');
        return;
      }

      const text = balances
        .map((b) => `${b.asset}: ${b.free}${parseFloat(b.locked) > 0 ? ` (в ордерах: ${b.locked})` : ''}`)
        .join('\n');
      await ctx.reply(`Баланс MEXC:\n${text}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.reply(`Не удалось получить баланс: ${message}`);
    }
  }
}
