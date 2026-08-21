# TradeBot

Telegram-бот на [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) для просмотра баланса на криптобирже [MEXC](https://www.mexc.com/).

## Возможности

- `/balance` — запрашивает баланс аккаунта на MEXC (подписанный запрос к `GET /api/v3/account`) и присылает список ненулевых активов.
- `/start` — подписывает чат на уведомления о спотовых сделках.
- Уведомления о спотовых сделках на MEXC: бот открывает приватный WebSocket user data stream MEXC (канал `spot@private.deals.v3.api`) и присылает сообщение по каждой сделке всем, кто написал `/start`. Настраивать торговые пары не нужно — приходят сделки по всем парам аккаунта, независимо от того, кем они были совершены — вручную или грид-ботом.

## Структура проекта

| Файл | Назначение |
|---|---|
| `core/bot.ts` | Точка входа: инициализация Telegram-бота, обработчики команд, запуск слежения за сделками. |
| `core/subscribers.ts` | Хранение chat_id подписчиков на уведомления (`data/subscribers.json`). |
| `core/trade-watcher.ts` | WebSocket-подключение к MEXC (user data stream), декодирование protobuf-сообщений о сделках и рассылка уведомлений подписчикам. |
| `core/mexc-ws/push-data.proto` | Минимальная protobuf-схема для декодирования сообщений MEXC WebSocket (канал приватных сделок). |
| `commands/` | Классы команд (`Command` — базовый класс, `Balance` — `/balance`). |
| `commands/utilits/mexc.ts` | Интеграция с MEXC API: подписанные запросы (HMAC SHA256), баланс и управление listenKey для user data stream. |
| `model/` | Общие TypeScript-типы (MEXC-ответы, баланс, сделки). |
| `system.config.cjs` | Конфиг PM2 для запуска бота на сервере (запускает собранный `dist/bot.js`). |
| `.github/workflows/deploy.yml` | GitHub Actions: деплой на VDS по SSH при пуше в `main`. |

Проект написан на TypeScript и собирается в `dist/` перед запуском. Состояние подписчиков хранится в `data/` (не коммитится, создаётся автоматически).

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
- `MEXC_API_KEY` / `MEXC_API_SECRET` — создать в личном кабинете MEXC (Account → API Management). Достаточно права **Read** (чтение баланса и сделок), создавать права на вывод/торговлю не нужно. Если в настройках ключа включено ограничение по IP — добавьте IP сервера, на котором запущен бот.

Торговые пары настраивать не нужно — слежение включается сразу по всем парам аккаунта.

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
