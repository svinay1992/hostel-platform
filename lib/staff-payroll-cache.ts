import { promises as fs } from 'fs';
import path from 'path';

export type StaffPayrollMeta = {
  staff_id: number;
  joined_date: string;
  left_date: string | null;
};

export type StaffSalaryPayment = {
  id: string;
  staff_id: number;
  month_key: string;
  amount: number;
  mode: 'Cash' | 'Bank Transfer' | 'UPI';
  paid_at: string;
};

type StaffPayrollCache = {
  staff_meta: StaffPayrollMeta[];
  salary_payments: StaffSalaryPayment[];
};

const CACHE_PATH = path.join(process.cwd(), 'data', 'staff-payroll-cache.json');

function defaultCache(): StaffPayrollCache {
  return {
    staff_meta: [],
    salary_payments: [],
  };
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

async function readCache(): Promise<StaffPayrollCache> {
  await ensureCacheFile();
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StaffPayrollCache>;
    return {
      staff_meta: Array.isArray(parsed.staff_meta) ? parsed.staff_meta : [],
      salary_payments: Array.isArray(parsed.salary_payments) ? parsed.salary_payments : [],
    };
  } catch {
    return defaultCache();
  }
}

async function writeCache(cache: StaffPayrollCache) {
  await ensureCacheFile();
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache), 'utf8');
}

export async function upsertStaffMeta(
  staffId: number,
  updates: Partial<Pick<StaffPayrollMeta, 'joined_date' | 'left_date'>>,
) {
  const cache = await readCache();
  const idx = cache.staff_meta.findIndex((row) => row.staff_id === staffId);
  const current = idx >= 0 ? cache.staff_meta[idx] : null;

  const next: StaffPayrollMeta = {
    staff_id: staffId,
    joined_date: updates.joined_date || current?.joined_date || new Date().toISOString().slice(0, 10),
    left_date:
      updates.left_date !== undefined
        ? updates.left_date
        : current?.left_date !== undefined
          ? current.left_date
          : null,
  };

  if (idx >= 0) {
    cache.staff_meta[idx] = next;
  } else {
    cache.staff_meta.push(next);
  }

  await writeCache(cache);
  return next;
}

export async function getStaffMetaMap(staffIds: number[]) {
  const cache = await readCache();
  const allowed = new Set(staffIds);
  const filtered = cache.staff_meta.filter((row) => allowed.has(row.staff_id));
  return filtered.reduce((acc, row) => {
    acc[row.staff_id] = row;
    return acc;
  }, {} as Record<number, StaffPayrollMeta>);
}

export async function addStaffSalaryPayment(entry: Omit<StaffSalaryPayment, 'id'>) {
  const cache = await readCache();
  const newEntry: StaffSalaryPayment = {
    ...entry,
    id: `${entry.staff_id}-${entry.month_key}-${Date.now()}`,
  };
  cache.salary_payments.unshift(newEntry);
  await writeCache(cache);
  return newEntry;
}

export async function getStaffSalaryPayments(staffIds?: number[]) {
  const cache = await readCache();
  if (!staffIds || staffIds.length === 0) return cache.salary_payments;
  const allowed = new Set(staffIds);
  return cache.salary_payments.filter((row) => allowed.has(row.staff_id));
}
