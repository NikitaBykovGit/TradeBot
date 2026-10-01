import type { Context } from 'node-telegram-bot-api';

export abstract class Command {
  abstract run(ctx: Context): Promise<void>;
}
