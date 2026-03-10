import { promises as fs } from 'fs';
import path from 'path';

type BreakdownCache = Record<string, string>;

const CACHE_PATH = path.join(process.cwd(), 'data', 'invoice-breakdown-cache.json');

async function ensureCacheFile() {
  const dir = path.dirname(CACHE_PATH);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(CACHE_PATH);
  } catch {
    await fs.writeFile(CACHE_PATH, '{}', 'utf8');
  }
}

async function readCache(): Promise<BreakdownCache> {
  await ensureCacheFile();
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as BreakdownCache;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCache(cache: BreakdownCache) {
  await ensureCacheFile();
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache), 'utf8');
}

export async function getBreakdownNotes(invoiceIds: number[]) {
  const cache = await readCache();
  const map: Record<number, string> = {};
  for (const id of invoiceIds) {
    const key = String(id);
    if (cache[key]) map[id] = cache[key];
  }
  return map;
}

export async function setBreakdownNote(invoiceId: number, note: string) {
  const cache = await readCache();
  cache[String(invoiceId)] = note;
  await writeCache(cache);
}

export async function removeBreakdownNote(invoiceId: number) {
  const cache = await readCache();
  delete cache[String(invoiceId)];
  await writeCache(cache);
}
