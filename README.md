# TradeBot

Telegram-бот на [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) для просмотра баланса на криптобирже [MEXC](https://www.mexc.com/).

## Возможности

- `/balance` — запрашивает баланс аккаунта на MEXC (подписанный запрос к `GET /api/v3/account`) и присылает список ненулевых активов.

## Структура проекта

| Файл | Назначение |
|---|---|
| `bot.js` | Точка входа: инициализация Telegram-бота, обработчики команд. |
| `mexc.js` | Интеграция с MEXC API: подпись запроса (HMAC SHA256) и получение баланса. |
| `system.config.js` | Конфиг PM2 для запуска бота на сервере. |
| `.github/workflows/deploy.yml` | GitHub Actions: деплой на VDS по SSH при пуше в `main`. |

## Установка

```bash
npm install
```

## Настройка окружения

Создайте файл `.env` в корне проекта (он не хранится в git):

```env
BOT_TOKEN=токен_telegram_бота
MEXC_API_KEY=ваш_api_key_mexc
MEXC_API_SECRET=ваш_api_secret_mexc
```

- `BOT_TOKEN` — получить у [@BotFather](https://t.me/BotFather).
- `MEXC_API_KEY` / `MEXC_API_SECRET` — создать в личном кабинете MEXC (Account → API Management). Достаточно права **Read** (чтение баланса), создавать права на вывод/торговлю не нужно. Если в настройках ключа включено ограничение по IP — добавьте IP сервера, на котором запущен бот.

## Запуск

```bash
npm start
```

## Деплой

При пуше в ветку `main` GitHub Actions ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) подключается к VDS по SSH, делает `git pull`, `npm ci --omit=dev` и перезапускает процесс через PM2 (`system.config.js`).

Требуемые секреты репозитория (Settings → Secrets and variables → Actions):

- `SSH_PRIVATE_KEY`
- `SSH_HOST`
- `SSH_USER`
- `SSH_PORT`
- `DEPLOY_PATH`

`.env` на сервере не создаётся деплоем автоматически — его нужно один раз завести вручную в `DEPLOY_PATH` с теми же переменными, что и локально. После изменения `.env` на сервере перезапустите процесс, чтобы переменные подхватились:

```bash
pm2 restart trade-bot
```
