import type { Context } from 'node-telegram-bot-api';
import { Command } from './abstract.js';
import { getMexcFuturesBalance, getBingxFuturesBalance } from './utilits/index.js';

export class Balance extends Command {
  async run(ctx: Context): Promise<void> {
    const [mexcResult, bingxResult] = await Promise.allSettled([getMexcFuturesBalance(), getBingxFuturesBalance()]);

    const lines: string[] = [];

    if (mexcResult.status === 'fulfilled') {
      lines.push(`MEXC: ${mexcResult.value.toFixed(2)} USDT`);
    } else {
      const message = mexcResult.reason instanceof Error ? mexcResult.reason.message : String(mexcResult.reason);
      lines.push(`❗ MEXC: не удалось получить баланс (${message})`);
    }

    if (bingxResult.status === 'fulfilled') {
      lines.push(`BingX: ${bingxResult.value.toFixed(2)} USDT`);
    } else {
      const message = bingxResult.reason instanceof Error ? bingxResult.reason.message : String(bingxResult.reason);
      lines.push(`❗ BingX: не удалось получить баланс (${message})`);
    }

    if (mexcResult.status === 'fulfilled' && bingxResult.status === 'fulfilled') {
      lines.push(`Итого: ${(mexcResult.value + bingxResult.value).toFixed(2)} USDT`);
    }

    await ctx.reply(`Баланс фьючерсов:\n${lines.join('\n')}`);
  }
}
