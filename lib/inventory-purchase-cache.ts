import { promises as fs } from 'fs';
import path from 'path';

type InventoryPriceMap = Record<string, number>;

export type InventoryPurchaseEntry = {
  id: string;
  item_id: number;
  item_name: string;
  category: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_cost: number;
  purchased_at: string;
};

type InventoryCache = {
  unit_prices: InventoryPriceMap;
  purchases: InventoryPurchaseEntry[];
};

const CACHE_PATH = path.join(process.cwd(), 'data', 'inventory-purchase-cache.json');

function defaultCache(): InventoryCache {
  return { unit_prices: {}, purchases: [] };
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

async function readCache(): Promise<InventoryCache> {
  await ensureCacheFile();
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<InventoryCache>;
    return {
      unit_prices: parsed.unit_prices && typeof parsed.unit_prices === 'object' ? parsed.unit_prices : {},
      purchases: Array.isArray(parsed.purchases) ? parsed.purchases : [],
    };
  } catch {
    return defaultCache();
  }
}

async function writeCache(cache: InventoryCache) {
  await ensureCacheFile();
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache), 'utf8');
}

export async function getInventoryUnitPriceMap(itemIds: number[]) {
  const cache = await readCache();
  const result: Record<number, number> = {};
  for (const id of itemIds) {
    const value = cache.unit_prices[String(id)];
    if (typeof value === 'number') {
      result[id] = value;
    }
  }
  return result;
}

export async function setInventoryUnitPrice(itemId: number, unitPrice: number) {
  const cache = await readCache();
  cache.unit_prices[String(itemId)] = Number.isFinite(unitPrice) ? unitPrice : 0;
  await writeCache(cache);
}

export async function removeInventoryUnitPrice(itemId: number) {
  const cache = await readCache();
  delete cache.unit_prices[String(itemId)];
  await writeCache(cache);
}

export async function addInventoryPurchase(entry: Omit<InventoryPurchaseEntry, 'id'>) {
  const cache = await readCache();
  const newEntry: InventoryPurchaseEntry = {
    ...entry,
    id: `${entry.item_id}-${Date.now()}`,
  };
  cache.purchases.unshift(newEntry);
  await writeCache(cache);
  return newEntry;
}

export async function getInventoryPurchaseHistory() {
  const cache = await readCache();
  return cache.purchases;
}

export async function removeInventoryPurchasesByItemId(itemId: number) {
  const cache = await readCache();
  const removed = cache.purchases.filter((entry) => entry.item_id === itemId);
  cache.purchases = cache.purchases.filter((entry) => entry.item_id !== itemId);
  await writeCache(cache);
  return removed;
}

export async function clearInventoryPurchaseHistory() {
  const cache = await readCache();
  const removedCount = cache.purchases.length;
  cache.purchases = [];
  await writeCache(cache);
  return removedCount;
}
