import { promises as fs } from 'node:fs';
import path from 'node:path';

const STORE_PATH = path.resolve(process.cwd(), 'data', 'subscribers.json');

async function readSubscribers(): Promise<number[]> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    return JSON.parse(raw) as number[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

export async function addSubscriber(chatId: number): Promise<void> {
  const chatIds = await readSubscribers();
  if (chatIds.includes(chatId)) {
    return;
  }

  chatIds.push(chatId);
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(chatIds, null, 2));
}

export async function getSubscribers(): Promise<number[]> {
  return readSubscribers();
}
