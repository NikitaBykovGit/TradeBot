require('dotenv').config();
const { Bot } = require('node-telegram-bot-api');
const { run } = require('node-telegram-bot-api/node');

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error('BOT_TOKEN не задан. Укажите его в файле .env');
  process.exit(1);
}

const bot = new Bot(token);

bot.on('message', (ctx) => {
  if (ctx.message?.text) {
    ctx.reply(ctx.message.text);
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
