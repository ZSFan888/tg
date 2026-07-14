import type { Context } from 'grammy';
import type { Env } from '../types/env';

export type BotContext = Context & {
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
};
