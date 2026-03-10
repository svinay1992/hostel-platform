import { promises as fs } from 'fs';
import path from 'path';

type StudentElectricityRecord = {
  units: number;
  ratePerUnit: number;
};

type StudentElectricityCache = Record<string, StudentElectricityRecord>;

const CACHE_PATH = path.join(process.cwd(), 'data', 'student-electricity-cache.json');

async function ensureCacheFile() {
  const dir = path.dirname(CACHE_PATH);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(CACHE_PATH);
  } catch {
    await fs.writeFile(CACHE_PATH, '{}', 'utf8');
  }
}

async function readCache(): Promise<StudentElectricityCache> {
  await ensureCacheFile();
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as StudentElectricityCache;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCache(cache: StudentElectricityCache) {
  await ensureCacheFile();
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache), 'utf8');
}

export async function getStudentElectricityMap(studentIds: number[]) {
  const cache = await readCache();
  const map: Record<number, StudentElectricityRecord> = {};
  for (const id of studentIds) {
    const key = String(id);
    if (cache[key]) {
      map[id] = cache[key];
    }
  }
  return map;
}

export async function setStudentElectricityData(studentId: number, units: number, ratePerUnit: number) {
  const cache = await readCache();
  cache[String(studentId)] = {
    units: Number.isFinite(units) ? units : 0,
    ratePerUnit: Number.isFinite(ratePerUnit) ? ratePerUnit : 0,
  };
  await writeCache(cache);
}

export async function removeStudentElectricityData(studentId: number) {
  const cache = await readCache();
  delete cache[String(studentId)];
  await writeCache(cache);
}
