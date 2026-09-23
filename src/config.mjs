import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function openRouterKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const path = new URL('../.env', import.meta.url);
  let contents;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    throw new Error('Set OPENROUTER_API_KEY or create a private .env with openrouter_key=...');
  }
  const line = contents.split(/\r?\n/).find((entry) => /^\s*openrouter_key\s*=/.test(entry));
  if (!line) throw new Error('Missing openrouter_key in .env');
  const value = line.slice(line.indexOf('=') + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
  if (!value) throw new Error('Empty openrouter_key in .env');
  return value;
}
