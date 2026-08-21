# TradeBot

Telegram-бот на [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) для просмотра баланса на криптобирже [MEXC](https://www.mexc.com/).

## Возможности

- `/balance` — запрашивает баланс аккаунта на MEXC (подписанный запрос к `GET /api/v3/account`) и присылает список ненулевых активов.
- `/start` — подписывает чат на уведомления о спотовых сделках.
- Уведомления о спотовых сделках на MEXC: бот раз в `TRADE_POLL_INTERVAL_MS` опрашивает `GET /api/v3/myTrades` по парам из `TRADE_SYMBOLS` (см. `config.ts`) и присылает сообщение по каждой новой сделке всем, кто написал `/start`. Уведомления приходят по всем сделкам аккаунта на указанных парах, независимо от того, кем они были совершены — вручную или грид-ботом.

## Структура проекта

| Файл | Назначение |
|---|---|
| `config.ts` | Настройки слежения за сделками (`TRADE_SYMBOLS`, `TRADE_POLL_INTERVAL_MS`) — коммитятся вместе с кодом. |
| `core/bot.ts` | Точка входа: инициализация Telegram-бота, обработчики команд, запуск слежения за сделками. |
| `core/subscribers.ts` | Хранение chat_id подписчиков на уведомления (`data/subscribers.json`). |
| `core/trade-watcher.ts` | Поллинг спотовых сделок MEXC и рассылка уведомлений подписчикам. |
| `commands/` | Классы команд (`Command` — базовый класс, `Balance` — `/balance`). |
| `commands/utilits/mexc.ts` | Интеграция с MEXC API: подписанные запросы (HMAC SHA256), баланс и история сделок. |
| `model/` | Общие TypeScript-типы (MEXC-ответы, баланс, сделки). |
| `system.config.cjs` | Конфиг PM2 для запуска бота на сервере (запускает собранный `dist/bot.js`). |
| `.github/workflows/deploy.yml` | GitHub Actions: деплой на VDS по SSH при пуше в `main`. |

Проект написан на TypeScript и собирается в `dist/` перед запуском. Состояние подписчиков и последних увиденных сделок хранится в `data/` (не коммитится, создаётся автоматически).

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
- `MEXC_API_KEY` / `MEXC_API_SECRET` — создать в личном кабинете MEXC (Account → API Management). Достаточно права **Read** (чтение баланса и истории сделок), создавать права на вывод/торговлю не нужно. Если в настройках ключа включено ограничение по IP — добавьте IP сервера, на котором запущен бот.

Торговые пары и интервал опроса — не секрет, поэтому они не в `.env`, а в `config.ts` (коммитится в git):

```ts
export const TRADE_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'GOLD(XAUT)USDT'];
export const TRADE_POLL_INTERVAL_MS = 20_000;
```

- `TRADE_SYMBOLS` — торговые пары, по которым отслеживаются сделки. Если оставить пустой массив — слежение за сделками отключено.
- `TRADE_POLL_INTERVAL_MS` — интервал опроса MEXC в миллисекундах.

## Запуск

Для разработки (запуск `.ts` напрямую, с автоперезапуском при изменениях):

```bash
npm run dev
```

Для продакшена (сборка в `dist/`, затем запуск):

```bash
npm run build
npm start
```

## Деплой

При пуше в ветку `main` GitHub Actions ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) подключается к VDS по SSH, делает `git pull`, `npm ci`, `npm run build`, `npm prune --omit=dev` и перезапускает процесс через PM2 (`system.config.cjs`).

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
