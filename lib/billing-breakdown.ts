type BillService = {
  name: string;
  amount: number;
};

type BillMeta = {
  baseRent: number;
  electricityUnits: number;
  electricityRate: number;
  electricityAmount: number;
  customServiceName: string | null;
  customServiceAmount: number;
  services?: BillService[];
  totalAmount: number;
  finalizedAt?: string;
  meterInitialUnits?: number;
  meterCurrentUnits?: number;
};

const META_PREFIX = '[BILL_META]';

function toSafeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeServices(raw: unknown): BillService[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const rec = item as { name?: unknown; amount?: unknown };
      const name = String(rec.name || '').trim();
      const amount = toSafeNumber(rec.amount);
      if (!name && amount <= 0) return null;
      return { name: name || 'Service', amount };
    })
    .filter((item): item is BillService => item !== null);
}

export function buildAdditionalNotes(userNotes: string | null | undefined, meta: BillMeta) {
  const cleanUserNotes = (userNotes || '').trim();
  const packedMeta = `${META_PREFIX}${JSON.stringify(meta)}`;
  return cleanUserNotes ? `${cleanUserNotes}\n\n${packedMeta}` : packedMeta;
}

export function parseAdditionalNotes(notes: string | null | undefined) {
  const raw = notes || '';
  const index = raw.lastIndexOf(META_PREFIX);
  if (index === -1) {
    return {
      meta: null as BillMeta | null,
      plainNotes: raw.trim(),
    };
  }

  const metaRaw = raw.slice(index + META_PREFIX.length).trim();
  let meta: BillMeta | null = null;

  try {
    const parsed = JSON.parse(metaRaw) as Partial<BillMeta>;
    meta = {
      baseRent: toSafeNumber(parsed.baseRent),
      electricityUnits: toSafeNumber(parsed.electricityUnits),
      electricityRate: toSafeNumber(parsed.electricityRate),
      electricityAmount: toSafeNumber(parsed.electricityAmount),
      customServiceName: parsed.customServiceName ? String(parsed.customServiceName) : null,
      customServiceAmount: toSafeNumber(parsed.customServiceAmount),
      services: normalizeServices(parsed.services),
      totalAmount: toSafeNumber(parsed.totalAmount),
      finalizedAt: parsed.finalizedAt ? String(parsed.finalizedAt) : undefined,
      meterInitialUnits: toSafeNumber((parsed as { meterInitialUnits?: unknown }).meterInitialUnits),
      meterCurrentUnits: toSafeNumber((parsed as { meterCurrentUnits?: unknown }).meterCurrentUnits),
    };
  } catch {
    meta = null;
  }

  return {
    meta,
    plainNotes: raw.slice(0, index).trim(),
  };
}

export function resolveInvoiceBreakdown(
  invoice: {
    amount?: number | null;
    base_rent?: number | null;
    electricity_units?: number | null;
    electricity_rate?: number | null;
    electricity_amount?: number | null;
    custom_service_name?: string | null;
    custom_service_amount?: number | null;
    additional_notes?: string | null;
  },
  fallbackBaseRent = 0
) {
  const parsed = parseAdditionalNotes(invoice.additional_notes);
  const meta = parsed.meta;
  const hasMetaBreakdown = Boolean(
    meta &&
    (
      meta.baseRent > 0 ||
      meta.electricityAmount > 0 ||
      meta.customServiceAmount > 0 ||
      (meta.services && meta.services.length > 0)
    )
  );
  const pickNumber = (value: number | null | undefined, metaValue: number | undefined, fallback = 0) => {
    if (value === null || value === undefined) {
      return toSafeNumber(metaValue, fallback);
    }
    return toSafeNumber(value, fallback);
  };

  const pickText = (value: string | null | undefined, metaValue: string | null | undefined) => {
    const cleanValue = (value || '').trim();
    if (cleanValue) return cleanValue;
    return (metaValue || '').trim();
  };

  const hasStructuredFields =
    invoice.base_rent !== undefined ||
    invoice.electricity_units !== undefined ||
    invoice.electricity_rate !== undefined ||
    invoice.electricity_amount !== undefined ||
    invoice.custom_service_name !== undefined ||
    invoice.custom_service_amount !== undefined;

  const baseRent = hasMetaBreakdown
    ? toSafeNumber(meta?.baseRent, fallbackBaseRent || toSafeNumber(invoice.amount))
    : hasStructuredFields
    ? pickNumber(invoice.base_rent, meta?.baseRent, fallbackBaseRent || toSafeNumber(invoice.amount))
    : toSafeNumber(meta?.baseRent, fallbackBaseRent || toSafeNumber(invoice.amount));

  const electricityUnits = hasMetaBreakdown
    ? toSafeNumber(meta?.electricityUnits)
    : hasStructuredFields
    ? pickNumber(invoice.electricity_units, meta?.electricityUnits)
    : toSafeNumber(meta?.electricityUnits);

  const electricityRate = hasMetaBreakdown
    ? toSafeNumber(meta?.electricityRate)
    : hasStructuredFields
    ? pickNumber(invoice.electricity_rate, meta?.electricityRate)
    : toSafeNumber(meta?.electricityRate);

  const electricityAmount = hasMetaBreakdown
    ? toSafeNumber(meta?.electricityAmount, electricityUnits * electricityRate)
    : hasStructuredFields
    ? pickNumber(invoice.electricity_amount, meta?.electricityAmount, electricityUnits * electricityRate)
    : toSafeNumber(meta?.electricityAmount, electricityUnits * electricityRate);

  const customServiceName = hasMetaBreakdown
    ? (meta?.customServiceName || '').trim()
    : hasStructuredFields
    ? pickText(invoice.custom_service_name, meta?.customServiceName)
    : (meta?.customServiceName || '').trim();

  const customServiceAmount = hasMetaBreakdown
    ? toSafeNumber(meta?.customServiceAmount)
    : hasStructuredFields
    ? pickNumber(invoice.custom_service_amount, meta?.customServiceAmount)
    : toSafeNumber(meta?.customServiceAmount);
  const metaServices = normalizeServices(meta?.services);
  const services = metaServices.length > 0
    ? metaServices
    : (customServiceName || customServiceAmount > 0)
      ? [{ name: customServiceName || 'Service', amount: customServiceAmount }]
      : [];
  const servicesTotal = services.reduce((sum, svc) => sum + toSafeNumber(svc.amount), 0);
  const mergedCustomServiceAmount = services.length > 0 ? servicesTotal : customServiceAmount;
  const mergedCustomServiceName = services.length > 0
    ? services.map((svc) => svc.name).join(', ')
    : customServiceName;

  return {
    baseRent,
    electricityUnits,
    electricityRate,
    electricityAmount,
    customServiceName: mergedCustomServiceName,
    customServiceAmount: mergedCustomServiceAmount,
    services,
    plainNotes: parsed.plainNotes,
    finalizedAt: meta?.finalizedAt || null,
  };
}
