import 'dotenv/config';

import { Bot, Context } from 'node-telegram-bot-api';
import { run } from 'node-telegram-bot-api/node';

import { Balance } from '#commands';

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error('BOT_TOKEN не задан. Укажите его в файле .env');
  process.exit(1);
}

const bot = new Bot(token);

bot.command('balance', async (ctx: Context) => {
  const command = new Balance();
  await command.run(ctx);
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
