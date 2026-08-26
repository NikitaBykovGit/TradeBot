import 'dotenv/config';

import { Bot, Context, ReplyKeyboardBuilder } from 'node-telegram-bot-api';
import { run } from 'node-telegram-bot-api/node';

import { Balance, Status, Trade, Stop } from '#commands';
import { addSubscriber } from './subscribers.js';
import { startTradeWatcher } from './trade-watcher.js';
import { startArbitrageWatcher } from './arbitrage-watcher.js';

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
  .row()
  .text('/trade')
  .text('/stop')
  .build({ resize_keyboard: true, is_persistent: true });

bot.command('start', async (ctx: Context) => {
  if (ctx.chatId !== undefined) {
    await addSubscriber(ctx.chatId);
  }
  await ctx.reply(
    'Привет! Я пришлю уведомление о каждой спотовой сделке на MEXC, а также об арбитражных возможностях между фьючерсами MEXC и BingX.',
    { reply_markup: mainKeyboard },
  );
});

bot.command('balance', async (ctx: Context) => {
  const command = new Balance();
  await command.run(ctx);
});

bot.command('status', async (ctx: Context) => {
  const command = new Status();
  await command.run(ctx);
});

bot.command('trade', async (ctx: Context) => {
  const command = new Trade();
  await command.run(ctx);
});

bot.command('stop', async (ctx: Context) => {
  const command = new Stop();
  await command.run(ctx);
});

startTradeWatcher(bot);
startArbitrageWatcher(bot);

bot.catch((err) => {
  console.error('Bot error:', err);
});

run(bot)
  .then(() => console.log('Бот запущен'))
  .catch((err) => {
    console.error('Не удалось запустить бота:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
