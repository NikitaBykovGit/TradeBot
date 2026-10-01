import 'dotenv/config';

import { Bot, Context, ReplyKeyboardBuilder } from 'node-telegram-bot-api';
import { run } from 'node-telegram-bot-api/node';

import { Balance, Status, Stop } from '#commands';

const token = process.env.BOT_TOKEN;
const ALLOWED_USERNAME = 'n1k1tabykov';

if (!token) {
  console.error('BOT_TOKEN не задан. Укажите его в файле .env');
  process.exit(1);
}

const bot = new Bot(token);

bot.use(async (ctx, next) => {
  const username = ctx.from?.username?.toLowerCase();
  if (username !== ALLOWED_USERNAME) {
    if (ctx.chat) {
      await ctx.reply('Бот недоступен.');
    }
    return;
  }

  await next();
});

const mainKeyboard = new ReplyKeyboardBuilder()
  .text('/balance')
  .text('/status')
  .text('/stop')
  .build({ resize_keyboard: true, is_persistent: true });

bot.command('start', async (ctx: Context) => {
  await ctx.reply('Привет! Команды: /balance — баланс фьючерсов MEXC, /status — открытые позиции, /stop — закрыть все позиции.', {
    reply_markup: mainKeyboard,
  });
});

bot.command('balance', async (ctx: Context) => {
  const command = new Balance();
  await command.run(ctx);
});

bot.command('status', async (ctx: Context) => {
  const command = new Status();
  await command.run(ctx);
});

bot.command('stop', async (ctx: Context) => {
  const command = new Stop();
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
