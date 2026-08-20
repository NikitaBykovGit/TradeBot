import 'dotenv/config';

import { Bot, Context } from 'node-telegram-bot-api';
import { run } from 'node-telegram-bot-api/node';

import { Balance } from '#commands';
import { addSubscriber } from './subscribers.js';
import { startGridWatcher } from './grid-watcher.js';

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error('BOT_TOKEN не задан. Укажите его в файле .env');
  process.exit(1);
}

const bot = new Bot(token);

bot.command('start', async (ctx: Context) => {
  if (ctx.chatId !== undefined) {
    await addSubscriber(ctx.chatId);
  }
  await ctx.reply('Привет! Я пришлю уведомление, когда грид-бот на MEXC совершит сделку.');
});

bot.command('balance', async (ctx: Context) => {
  const command = new Balance();
  await command.run(ctx);
});

startGridWatcher(bot);

bot.catch((err) => {
  console.error('Bot error:', err);
});

run(bot)
  .then(() => console.log('Бот запущен'))
  .catch((err) => {
    console.error('Не удалось запустить бота:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
