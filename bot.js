require('dotenv').config();

const { Bot } = require('node-telegram-bot-api');
const { run } = require('node-telegram-bot-api/node');
const { getMexcBalance } = require('./mexc');

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error('BOT_TOKEN не задан. Укажите его в файле .env');
  process.exit(1);
}

const bot = new Bot(token);

bot.command('balance', async (ctx) => {
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
    await ctx.reply(`Не удалось получить баланс: ${err.message || err}`);
  }
});

bot.catch((err) => {
  console.error('Bot error:', err);
});

run(bot)
  .then(() => console.log('Бот запущен'))
  .catch((err) => {
    console.error('Не удалось запустить бота:', err.message || err);
    process.exit(1);
  });
