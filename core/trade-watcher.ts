import path from 'node:path';
import protobuf from 'protobufjs';
import { WebSocket } from 'ws';
import type { Bot } from 'node-telegram-bot-api';
import type { MexcTrade } from '../model';
import { createListenKey, keepAliveListenKey } from '../commands/utilits/index.js';
import { getSubscribers } from './subscribers.js';

const WS_URL = 'wss://wbs-api.mexc.com/ws';
const DEALS_CHANNEL = 'spot@private.deals.v3.api.pb';
const PING_INTERVAL_MS = 20_000;
const LISTEN_KEY_KEEPALIVE_MS = 30 * 60 * 1000;
const RECONNECT_DELAY_MS = 5_000;

const PROTO_PATH = path.resolve(process.cwd(), 'core', 'mexc-ws', 'push-data.proto');

interface PrivateDealsPayload {
  price: string;
  quantity: string;
  amount: string;
  tradeType: number;
  isMaker: boolean;
  tradeId: string;
  orderId: string;
  feeAmount: string;
  feeCurrency: string;
  time: number;
}

interface PushDataWrapperPayload {
  channel: string;
  symbol?: string;
  privateDeals?: PrivateDealsPayload;
}

let wrapperTypePromise: Promise<protobuf.Type> | undefined;

function getWrapperType(): Promise<protobuf.Type> {
  if (!wrapperTypePromise) {
    wrapperTypePromise = protobuf.load(PROTO_PATH).then((root) => root.lookupType('PushDataV3ApiWrapper'));
  }
  return wrapperTypePromise;
}

function formatTradeMessage(trade: MexcTrade): string {
  const side = trade.isBuyer ? 'Покупка' : 'Продажа';
  return (
    `${side} ${trade.symbol}\n` +
    `Цена: ${trade.price}\n` +
    `Кол-во: ${trade.qty}\n` +
    `Сумма: ${trade.quoteQty}`
  );
}

async function notifySubscribers(bot: Bot, trade: MexcTrade): Promise<void> {
  const chatIds = await getSubscribers();
  const text = formatTradeMessage(trade);

  for (const chatId of chatIds) {
    try {
      await bot.api.sendMessage({ chat_id: chatId, text });
    } catch (err) {
      console.error(`Не удалось отправить уведомление в чат ${chatId}:`, err instanceof Error ? err.message : err);
    }
  }
}

async function handleBinaryMessage(bot: Bot, data: Buffer): Promise<void> {
  const wrapperType = await getWrapperType();
  const decoded = wrapperType.toObject(wrapperType.decode(data), {
    longs: Number,
  }) as PushDataWrapperPayload;

  if (decoded.channel !== DEALS_CHANNEL || !decoded.privateDeals || !decoded.symbol) {
    return;
  }

  const deal = decoded.privateDeals;
  const trade: MexcTrade = {
    id: deal.tradeId,
    orderId: deal.orderId,
    symbol: decoded.symbol,
    price: deal.price,
    qty: deal.quantity,
    quoteQty: deal.amount,
    commission: deal.feeAmount,
    commissionAsset: deal.feeCurrency,
    time: deal.time,
    isBuyer: deal.tradeType === 1,
    isMaker: deal.isMaker,
  };

  await notifySubscribers(bot, trade);
}

function handleTextMessage(raw: string): void {
  try {
    const parsed = JSON.parse(raw) as { code?: number; msg?: string };
    if (parsed.code !== undefined && parsed.code !== 0) {
      console.error('MEXC websocket ответил ошибкой:', parsed.msg ?? raw);
    }
  } catch {
    // служебный, не-JSON фрейм — игнорируем
  }
}

function connect(bot: Bot): void {
  let pingTimer: NodeJS.Timeout | undefined;
  let keepAliveTimer: NodeJS.Timeout | undefined;
  let reconnectScheduled = false;

  const scheduleReconnect = () => {
    if (reconnectScheduled) return;
    reconnectScheduled = true;
    if (pingTimer) clearInterval(pingTimer);
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    setTimeout(() => connect(bot), RECONNECT_DELAY_MS);
  };

  createListenKey()
    .then((listenKey) => {
      const ws = new WebSocket(`${WS_URL}?listenKey=${listenKey}`);

      ws.on('open', () => {
        ws.send(JSON.stringify({ method: 'SUBSCRIPTION', params: [DEALS_CHANNEL] }));

        pingTimer = setInterval(() => {
          ws.send(JSON.stringify({ method: 'PING' }));
        }, PING_INTERVAL_MS);

        keepAliveTimer = setInterval(() => {
          keepAliveListenKey(listenKey).catch((err) => {
            console.error('Не удалось продлить listenKey MEXC:', err instanceof Error ? err.message : err);
          });
        }, LISTEN_KEY_KEEPALIVE_MS);

        console.log('Слежение за сделками MEXC включено (все спотовые пары аккаунта).');
      });

      ws.on('message', (data, isBinary) => {
        if (!isBinary) {
          handleTextMessage(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
          return;
        }

        const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
        handleBinaryMessage(bot, buf).catch((err) => {
          console.error('Ошибка обработки сделки MEXC:', err instanceof Error ? err.message : err);
        });
      });

      ws.on('error', (err) => {
        console.error('Ошибка websocket-соединения MEXC:', err instanceof Error ? err.message : err);
      });

      ws.on('close', () => {
        scheduleReconnect();
      });
    })
    .catch((err) => {
      console.error('Не удалось создать listenKey MEXC:', err instanceof Error ? err.message : err);
      scheduleReconnect();
    });
}

export function startTradeWatcher(bot: Bot): void {
  connect(bot);
}
