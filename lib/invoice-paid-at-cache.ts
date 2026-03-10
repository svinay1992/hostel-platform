import { promises as fs } from 'fs';
import path from 'path';

type PaidAtCache = Record<string, string>;

const CACHE_PATH = path.join(process.cwd(), 'data', 'invoice-paid-at-cache.json');

async function ensureCacheFile() {
  const dir = path.dirname(CACHE_PATH);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(CACHE_PATH);
  } catch {
    await fs.writeFile(CACHE_PATH, '{}', 'utf8');
  }
}

async function readCache(): Promise<PaidAtCache> {
  await ensureCacheFile();
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as PaidAtCache;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCache(cache: PaidAtCache) {
  await ensureCacheFile();
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache), 'utf8');
}

export async function getPaidAtMap(invoiceIds: number[]) {
  const cache = await readCache();
  const map: Record<number, string> = {};
  for (const id of invoiceIds) {
    const value = cache[String(id)];
    if (value) map[id] = value;
  }
  return map;
}

export async function setPaidAt(invoiceId: number, paidAtIso: string) {
  const cache = await readCache();
  cache[String(invoiceId)] = paidAtIso;
  await writeCache(cache);
}

export async function removePaidAt(invoiceId: number) {
  const cache = await readCache();
  delete cache[String(invoiceId)];
  await writeCache(cache);
}
