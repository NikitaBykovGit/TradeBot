import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Bot } from 'node-telegram-bot-api';
import type { MexcTrade } from './model';
import { getMexcTrades } from './commands/utilits/index.js';
import { getSubscribers } from './subscribers.js';

const STATE_PATH = path.resolve(process.cwd(), 'data', 'grid-state.json');
const DEFAULT_POLL_INTERVAL_MS = 20_000;

type GridState = Record<string, number>;

async function readState(): Promise<GridState> {
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf8');
    return JSON.parse(raw) as GridState;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

async function writeState(state: GridState): Promise<void> {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

function formatTradeMessage(trade: MexcTrade): string {
  const side = trade.isBuyer ? 'Покупка' : 'Продажа';
  return (
    `🤖 Грид-бот: ${side} ${trade.symbol}\n` +
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

async function pollSymbol(bot: Bot, symbol: string, state: GridState): Promise<void> {
  const lastTime = state[symbol];
  const startTime = lastTime !== undefined ? lastTime + 1 : undefined;
  const trades = await getMexcTrades(symbol, startTime);

  if (lastTime === undefined) {
    state[symbol] = Date.now();
    return;
  }

  if (trades.length === 0) {
    return;
  }

  trades.sort((a, b) => a.time - b.time);
  for (const trade of trades) {
    await notifySubscribers(bot, trade);
  }

  state[symbol] = trades[trades.length - 1]!.time;
}

export function startGridWatcher(bot: Bot): void {
  const symbols = (process.env.GRID_SYMBOLS ?? '')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    console.log('GRID_SYMBOLS не задан — уведомления о сделках грид-бота отключены.');
    return;
  }

  const pollIntervalMs = Number(process.env.GRID_POLL_INTERVAL_MS) || DEFAULT_POLL_INTERVAL_MS;

  setInterval(async () => {
    const state = await readState();
    let changed = false;

    for (const symbol of symbols) {
      const before = state[symbol];
      try {
        await pollSymbol(bot, symbol, state);
      } catch (err) {
        console.error(`Ошибка опроса сделок MEXC по ${symbol}:`, err instanceof Error ? err.message : err);
        continue;
      }
      if (state[symbol] !== before) {
        changed = true;
      }
    }

    if (changed) {
      await writeState(state);
    }
  }, pollIntervalMs);

  console.log(`Слежение за сделками грид-бота включено: ${symbols.join(', ')} (каждые ${pollIntervalMs / 1000} с).`);
}
