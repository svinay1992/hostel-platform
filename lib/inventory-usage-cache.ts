import { promises as fs } from 'fs';
import path from 'path';

export type InventoryUsageEntry = {
  id: string;
  item_id: number;
  item_name: string;
  category: string;
  quantity_used: number;
  unit: string;
  unit_price: number;
  total_cost: number;
  used_for: string;
  used_at: string;
};

type UsageCache = {
  usage: InventoryUsageEntry[];
};

const CACHE_PATH = path.join(process.cwd(), 'data', 'inventory-usage-cache.json');

function defaultCache(): UsageCache {
  return { usage: [] };
}

async function ensureCacheFile() {
  const dir = path.dirname(CACHE_PATH);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(CACHE_PATH);
  } catch {
    await fs.writeFile(CACHE_PATH, JSON.stringify(defaultCache()), 'utf8');
  }
}

async function readCache(): Promise<UsageCache> {
  await ensureCacheFile();
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<UsageCache>;
    return {
      usage: Array.isArray(parsed.usage) ? parsed.usage : [],
    };
  } catch {
    return defaultCache();
  }
}

async function writeCache(cache: UsageCache) {
  await ensureCacheFile();
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache), 'utf8');
}

export async function addInventoryUsage(entry: Omit<InventoryUsageEntry, 'id'>) {
  const cache = await readCache();
  const newEntry: InventoryUsageEntry = {
    ...entry,
    id: `${entry.item_id}-use-${Date.now()}`,
  };
  cache.usage.unshift(newEntry);
  await writeCache(cache);
  return newEntry;
}

export async function getInventoryUsageHistory() {
  const cache = await readCache();
  return cache.usage;
}

export async function removeInventoryUsageByItemId(itemId: number) {
  const cache = await readCache();
  cache.usage = cache.usage.filter((entry) => entry.item_id !== itemId);
  await writeCache(cache);
}

export async function clearInventoryUsageHistory() {
  const cache = await readCache();
  const removedCount = cache.usage.length;
  cache.usage = [];
  await writeCache(cache);
  return removedCount;
}
