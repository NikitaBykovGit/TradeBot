import 'dotenv/config';

import { Bot, Context } from 'node-telegram-bot-api';
import { run } from 'node-telegram-bot-api/node';
import { getMexcBalance } from './mexc.js';

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error('BOT_TOKEN не задан. Укажите его в файле .env');
  process.exit(1);
}

const bot = new Bot(token);

bot.command('balance', async (ctx: Context) => {
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
});

bot.catch((err) => {
  console.error('Bot error:', err);
});

run(bot)
  .then(() => console.log('Бот запущен'))
  .catch((err) => {
    console.error('Не удалось запустить бота:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
