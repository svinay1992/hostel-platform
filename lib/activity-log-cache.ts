import { promises as fs } from 'fs';
import path from 'path';

export type ActivityActor = 'admin' | 'student' | 'system';
export type ActivityLevel = 'info' | 'warning' | 'critical';

export type ActivityLogEntry = {
  id: string;
  created_at: string;
  module: string;
  action: string;
  details: string;
  actor: ActivityActor;
  level: ActivityLevel;
};

type ActivityLogCache = {
  logs: ActivityLogEntry[];
};

const CACHE_PATH = path.join(process.cwd(), 'data', 'activity-log-cache.json');
const MAX_LOGS = 1000;

function defaultCache(): ActivityLogCache {
  return { logs: [] };
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

async function readCache(): Promise<ActivityLogCache> {
  await ensureCacheFile();
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ActivityLogCache>;
    return {
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
    };
  } catch {
    return defaultCache();
  }
}

async function writeCache(cache: ActivityLogCache) {
  await ensureCacheFile();
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache), 'utf8');
}

export async function addActivityLog(entry: Omit<ActivityLogEntry, 'id' | 'created_at'>) {
  const cache = await readCache();
  const now = new Date().toISOString();
  const newEntry: ActivityLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: now,
    module: entry.module,
    action: entry.action,
    details: entry.details,
    actor: entry.actor,
    level: entry.level,
  };

  cache.logs.unshift(newEntry);
  if (cache.logs.length > MAX_LOGS) {
    cache.logs = cache.logs.slice(0, MAX_LOGS);
  }

  await writeCache(cache);
  return newEntry;
}

export async function getActivityLogs(limit = 80) {
  const cache = await readCache();
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(300, Math.floor(limit))) : 80;
  return cache.logs.slice(0, safeLimit);
}

export async function clearActivityLogs() {
  const cache = await readCache();
  const removedCount = cache.logs.length;
  cache.logs = [];
  await writeCache(cache);
  return removedCount;
}
