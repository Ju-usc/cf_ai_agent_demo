import { Env } from '../backend/types';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}
