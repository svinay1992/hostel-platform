// Cache buster
export const dynamic = 'force-dynamic';

import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import FinanceDraftRow from '../_components/finance-draft-row';
import { buildAdditionalNotes, resolveInvoiceBreakdown } from '../../lib/billing-breakdown';
import { getBreakdownNotes, removeBreakdownNote, setBreakdownNote } from '../../lib/invoice-breakdown-cache';
import { getPaidAtMap, removePaidAt, setPaidAt } from '../../lib/invoice-paid-at-cache';
import { addActivityLog } from '../../lib/activity-log-cache';
import { getStudentElectricityMap, setStudentElectricityData } from '../../lib/student-electricity-cache';

type InvoiceRow = {
  id: number;
  student_id: number;
  amount: number | null;
  due_date: string | null;
  status: string | null;
  created_at: string | null;
  billing_month?: string | null;
  base_rent?: number | null;
  electricity_units?: number | null;
  electricity_rate?: number | null;
  electricity_amount?: number | null;
  custom_service_name?: string | null;
  custom_service_amount?: number | null;
  additional_notes?: string | null;
  is_finalized?: boolean | null;
  finalized_at?: string | null;
  paid_at?: string | null;
  student_admissions?: {
    full_name: string | null;
    phone: string | null;
    room_number: string | null;
    bed_number: string | null;
    electricity_units?: number | null;
    electricity_rate_per_unit?: number | null;
  } | null;
};

function toDateOnlyISO(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatBillMonth(value?: string | null) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function delayTag(invoice: InvoiceRow) {
  if (invoice.status !== 'Paid' || !invoice.paid_at || !invoice.due_date) return null;

  const due = new Date(invoice.due_date);
  const paid = new Date(invoice.paid_at);
  due.setHours(0, 0, 0, 0);
  paid.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((paid.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 0) return `Delayed by ${diffDays} day(s)`;
  return 'Paid on time';
}

async function maybeGenerateMonthlyDrafts(forceRun = false) {
  const now = new Date();
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const isGenerationDay = now.getDate() === lastDayOfMonth;

  if (!forceRun && !isGenerationDay) return;

  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const billingMonth = toDateOnlyISO(nextMonthStart);

  let activeStudents: Array<{
    id: number;
    advance_rent?: number | null;
    electricity_units?: number | null;
    electricity_rate_per_unit?: number | null;
  }> = [];

  const { data: studentsWithElectricity, error: studentsWithElectricityError } = await supabase
    .from('student_admissions')
    .select('id, advance_rent, electricity_units, electricity_rate_per_unit')
    .eq('status', 'ACTIVE');

  if (!studentsWithElectricityError && studentsWithElectricity) {
    activeStudents = studentsWithElectricity as typeof activeStudents;
  } else {
    const { data: studentsBasic } = await supabase
      .from('student_admissions')
      .select('id, advance_rent')
      .eq('status', 'ACTIVE');
    activeStudents = (studentsBasic || []) as typeof activeStudents;
  }

  if (!activeStudents || activeStudents.length === 0) return;

  const electricityCache = await getStudentElectricityMap(
    activeStudents.map((student) => Number(student.id)).filter((id) => Number.isFinite(id))
  );

  // Prefer billing_month (new schema), fallback to due_date-only check (old schema).
  let existingInvoices: { student_id: number; due_date: string | null }[] = [];
  const { data: existingByBillingMonth, error: existingByBillingMonthError } = await supabase
    .from('invoices')
    .select('student_id, due_date')
    .eq('billing_month', billingMonth);

  if (!existingByBillingMonthError && existingByBillingMonth) {
    existingInvoices = existingByBillingMonth as { student_id: number; due_date: string | null }[];
  } else {
    const { data: existingByDueDate } = await supabase
      .from('invoices')
      .select('student_id, due_date')
      .eq('due_date', billingMonth);
    existingInvoices = (existingByDueDate || []) as { student_id: number; due_date: string | null }[];
  }

  const existingKeys = new Set((existingInvoices || []).map((inv) => String(inv.student_id)));

  const draftsToInsert: Record<string, unknown>[] = [];

  for (const student of activeStudents) {
    const rentAmount = Number(student.advance_rent || 0);
    if (rentAmount <= 0) continue;
    if (existingKeys.has(String(student.id))) continue;
    const cached = electricityCache[Number(student.id)];
    const studentUnits = Number(student.electricity_units || 0);
    const studentRate = Number(student.electricity_rate_per_unit || 0);
    const resolvedUnits = Number.isFinite(studentUnits) && studentUnits > 0
      ? studentUnits
      : Number(cached?.units ?? 0);
    const resolvedRate = Number.isFinite(studentRate) && studentRate > 0
      ? studentRate
      : Number(cached?.ratePerUnit ?? 12);

    draftsToInsert.push({
      student_id: student.id,
      billing_month: billingMonth,
      due_date: billingMonth,
      base_rent: rentAmount,
      electricity_units: Number.isFinite(resolvedUnits) ? resolvedUnits : 0,
      electricity_rate: resolvedRate,
      electricity_amount: 0,
      custom_service_name: null,
      custom_service_amount: 0,
      amount: rentAmount,
      status: 'Draft',
      is_finalized: false,
      finalized_at: null,
      paid_at: null,
    });
  }

  if (draftsToInsert.length > 0) {
    const { error } = await supabase.from('invoices').insert(draftsToInsert);
    if (!error) {
      await addActivityLog({
        module: 'Finance',
        action: 'Draft Bills Generated',
        details: `${draftsToInsert.length} draft invoice(s) generated for ${billingMonth}`,
        actor: 'system',
        level: 'info',
      });
      return;
    }

    // Old schema fallback: insert only legacy columns.
    const legacyRows = draftsToInsert.map((row) => ({
      student_id: row.student_id,
      amount: row.amount,
      due_date: row.due_date,
      status: 'Draft',
    }));
    const { error: legacyError } = await supabase.from('invoices').insert(legacyRows);
    if (legacyError) {
      console.error('AUTO DRAFT BILL ERROR:', legacyError.message);
    }
  }
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ receipt?: string; error?: string }> }) {
  const resolvedParams = await searchParams;
  const receiptId = resolvedParams?.receipt;
  const financeError = resolvedParams?.error || '';

  // Day-before-next-month automation: runs automatically on month-end.
  await maybeGenerateMonthlyDrafts(false);

  let invoices: InvoiceRow[] = [];
  let fetchError: { message?: string } | null = null;

  const { data: invoicesWithElectricity, error: invoicesWithElectricityError } = await supabase
    .from('invoices')
    .select(`
      *,
      student_admissions ( full_name, phone, room_number, bed_number, electricity_units, electricity_rate_per_unit )
    `)
    .order('created_at', { ascending: false });

  if (!invoicesWithElectricityError && invoicesWithElectricity) {
    invoices = invoicesWithElectricity as InvoiceRow[];
  } else {
    fetchError = invoicesWithElectricityError;
    const { data: fallbackInvoices, error: fallbackError } = await supabase
      .from('invoices')
      .select(`
        *,
        student_admissions ( full_name, phone, room_number, bed_number )
      `)
      .order('created_at', { ascending: false });
    if (!fallbackError && fallbackInvoices) {
      invoices = fallbackInvoices as InvoiceRow[];
      fetchError = null;
    } else if (fallbackError) {
      fetchError = fallbackError;
    }
  }

  if (fetchError) console.error('FETCH ERROR:', fetchError.message);

  const typedInvoices = (invoices || []) as InvoiceRow[];
  const studentElectricityCache = await getStudentElectricityMap(
    typedInvoices.map((inv) => Number(inv.student_id)).filter((id) => Number.isFinite(id))
  );
  const breakdownNotesByInvoiceId = await getBreakdownNotes(typedInvoices.map((inv) => inv.id));
  const paidAtByInvoiceId = await getPaidAtMap(typedInvoices.map((inv) => inv.id));
 
  const totalCollected = typedInvoices
    .filter((inv) => inv.status === 'Paid')
    .reduce((sum, inv) => sum + Number(inv.amount || 0), 0);

  const outstandingDues = typedInvoices
    .filter((inv) => inv.status === 'Pending')
    .reduce((sum, inv) => sum + Number(inv.amount || 0), 0);

  async function runDraftGenerationNow() {
    'use server';
    await maybeGenerateMonthlyDrafts(true);
    await addActivityLog({
      module: 'Finance',
      action: 'Draft Generation Triggered',
      details: 'Admin manually triggered upcoming month draft bill generation',
      actor: 'admin',
      level: 'info',
    });
    revalidatePath('/finance');
    revalidatePath('/');
  }

  async function finalizeBill(formData: FormData) {
    'use server';
    const invoiceId = Number(formData.get('invoice_id'));
    const baseRentSnapshot = Number(formData.get('base_rent_snapshot') || 0);
    const electricityUnits = Number(formData.get('electricity_units') || 0);
    const electricityRate = Number(formData.get('electricity_rate') || 0);
    const electricityAmountSnapshot = Number(formData.get('electricity_amount_snapshot') || 0);
    const totalAmountSnapshot = Number(formData.get('total_amount_snapshot') || 0);
    const initialMeterUnits = Number(formData.get('initial_meter_units') || 0);
    const currentMeterUnits = Number(formData.get('current_meter_units') || 0);
    const customServicesRaw = (formData.get('custom_services_json') as string | null) || '[]';
    const additionalNotes = (formData.get('additional_notes') as string | null)?.trim() || null;

    let invoice: { student_id?: number | null; base_rent?: number | null; amount?: number | null; additional_notes?: string | null } | null = null;
    const { data: invoiceWithSplit, error: invoiceWithSplitError } = await supabase
      .from('invoices')
      .select('student_id, base_rent, amount, additional_notes')
      .eq('id', invoiceId)
      .single();

    if (!invoiceWithSplitError && invoiceWithSplit) {
      invoice = invoiceWithSplit as { student_id?: number | null; base_rent?: number | null; amount?: number | null; additional_notes?: string | null };
    } else {
      const { data: legacyInvoice } = await supabase
        .from('invoices')
        .select('student_id, amount')
        .eq('id', invoiceId)
        .single();
      invoice = (legacyInvoice as { student_id?: number | null; amount?: number | null } | null) || null;
    }

    const previousBreakdown = resolveInvoiceBreakdown(
      {
        base_rent: invoice?.base_rent,
        amount: invoice?.amount,
        additional_notes: invoice?.additional_notes,
      },
      Number(invoice?.amount ?? 0)
    );
    const { data: student } = await supabase
      .from('student_admissions')
      .select('advance_rent')
      .eq('id', invoice?.student_id || 0)
      .single();
    const baseRent = Number(
      baseRentSnapshot > 0
        ? baseRentSnapshot
        : previousBreakdown.baseRent > 0
          ? previousBreakdown.baseRent
          : Number(student?.advance_rent || 0)
    );

    let parsedServices: Array<{ name: string; amount: number }> = [];
    try {
      const raw = JSON.parse(customServicesRaw) as Array<{ name?: unknown; amount?: unknown }>;
      parsedServices = (Array.isArray(raw) ? raw : [])
        .map((service) => ({
          name: String(service?.name || '').trim(),
          amount: Number.isFinite(Number(service?.amount)) ? Number(service?.amount) : 0,
        }))
        .filter((service) => service.name || service.amount > 0)
        .map((service) => ({ name: service.name || 'Service', amount: service.amount }));
    } catch {
      parsedServices = [];
    }

    const computedElectricityUnits = Math.abs(Number((initialMeterUnits - currentMeterUnits).toFixed(2)));
    const electricityAmount = electricityAmountSnapshot > 0
      ? electricityAmountSnapshot
      : computedElectricityUnits * electricityRate;
    const customServiceAmount = parsedServices.reduce((sum, service) => sum + service.amount, 0);
    const customServiceName = parsedServices.length > 0
      ? parsedServices.map((service) => service.name).join(', ')
      : null;
    const calculatedTotal = baseRent + electricityAmount + customServiceAmount;
    const totalAmount = totalAmountSnapshot > 0 ? totalAmountSnapshot : calculatedTotal;
    const finalizedAt = new Date().toISOString();
    const packedNotes = buildAdditionalNotes(additionalNotes, {
      baseRent,
      electricityUnits: computedElectricityUnits,
      electricityRate,
      electricityAmount,
      customServiceName,
      customServiceAmount,
      services: parsedServices,
      totalAmount,
      finalizedAt,
      meterInitialUnits: initialMeterUnits,
      meterCurrentUnits: currentMeterUnits,
    });

    const { error: finalizeError } = await supabase
      .from('invoices')
      .update({
        base_rent: baseRent,
        electricity_units: computedElectricityUnits,
        electricity_rate: electricityRate,
        electricity_amount: electricityAmount,
        custom_service_name: customServiceName,
        custom_service_amount: customServiceAmount,
        additional_notes: packedNotes,
        amount: totalAmount,
        status: 'Pending',
        is_finalized: true,
        finalized_at: finalizedAt,
      })
      .eq('id', invoiceId);

    let finalizeSucceeded = !finalizeError;

    if (!finalizeSucceeded) {
      // Fallback for partial schema: try saving packed bill metadata in notes.
      const { error: fallbackWithNotesError } = await supabase
        .from('invoices')
        .update({
          additional_notes: packedNotes,
          amount: totalAmount,
          status: 'Pending',
        })
        .eq('id', invoiceId);

      finalizeSucceeded = !fallbackWithNotesError;

      if (!finalizeSucceeded) {
        // Legacy schema fallback: keep bill status/amount and store breakup in local cache.
        const { error: legacyFinalizeError } = await supabase
          .from('invoices')
          .update({
            amount: totalAmount,
            status: 'Pending',
          })
          .eq('id', invoiceId);

        finalizeSucceeded = !legacyFinalizeError;
      }
    }

    if (!finalizeSucceeded) {
      return redirect('/finance?error=finalize-update-failed');
    }

    if (invoice?.student_id) {
      const { error: studentElectricityUpdateError } = await supabase
        .from('student_admissions')
        .update({
          electricity_units: currentMeterUnits,
          electricity_rate_per_unit: electricityRate,
        })
        .eq('id', invoice.student_id);
      if (studentElectricityUpdateError && (studentElectricityUpdateError.message || '').includes('electricity_units')) {
        await setStudentElectricityData(Number(invoice.student_id), currentMeterUnits, electricityRate);
      } else {
        await setStudentElectricityData(Number(invoice.student_id), currentMeterUnits, electricityRate);
      }
    }

    // Always keep a server-side breakup cache keyed by invoice id.
    await setBreakdownNote(invoiceId, packedNotes);
    await addActivityLog({
      module: 'Finance',
      action: 'Bill Finalized',
      details: `Invoice #${invoiceId} finalized with total Rs ${totalAmount}`,
      actor: 'admin',
      level: 'warning',
    });

    revalidatePath('/finance');
    revalidatePath('/portal');
    revalidatePath('/');
  }

  async function markAsPaid(formData: FormData) {
    'use server';
    const invoiceId = Number(formData.get('invoice_id'));
    const paidAtNowIso = new Date().toISOString();

    const { error: paidError } = await supabase
      .from('invoices')
      .update({
        status: 'Paid',
        paid_at: paidAtNowIso,
      })
      .eq('id', invoiceId);

    let markPaidSucceeded = !paidError;
    if (paidError) {
      // Old schema fallback: keep status update even when paid_at column is missing.
      const { error: fallbackPaidError } = await supabase
        .from('invoices')
        .update({ status: 'Paid' })
        .eq('id', invoiceId);
      markPaidSucceeded = !fallbackPaidError;
    }

    if (markPaidSucceeded) {
      await setPaidAt(invoiceId, paidAtNowIso);
      await addActivityLog({
        module: 'Finance',
        action: 'Bill Marked Paid',
        details: `Invoice #${invoiceId} marked paid`,
        actor: 'admin',
        level: 'info',
      });
    }

    revalidatePath('/finance');
    revalidatePath('/portal');
    revalidatePath('/');
  }

  async function deleteInvoice(formData: FormData) {
    'use server';
    const invoiceId = Number(formData.get('invoice_id'));
    const { data: invoiceRow } = await supabase.from('invoices').select('amount').eq('id', invoiceId).single();
    await supabase.from('invoices').delete().eq('id', invoiceId);
    await removeBreakdownNote(invoiceId);
    await removePaidAt(invoiceId);
    await addActivityLog({
      module: 'Finance',
      action: 'Invoice Deleted',
      details: `Invoice #${invoiceId} deleted (amount Rs ${Number(invoiceRow?.amount || 0)})`,
      actor: 'admin',
      level: 'critical',
    });
    revalidatePath('/finance');
    revalidatePath('/portal');
    revalidatePath('/');
  }

  const viewingReceiptRaw = receiptId ? typedInvoices.find((inv) => inv.id.toString() === receiptId) : null;
  const viewingReceipt = viewingReceiptRaw
    ? {
        ...viewingReceiptRaw,
        additional_notes:
          breakdownNotesByInvoiceId[viewingReceiptRaw.id] ||
          viewingReceiptRaw.additional_notes ||
          null,
        paid_at: viewingReceiptRaw.paid_at || paidAtByInvoiceId[viewingReceiptRaw.id] || null,
      }
    : null;
  const rStudent = viewingReceipt?.student_admissions;
  const receiptBreakdown = viewingReceipt ? resolveInvoiceBreakdown(viewingReceipt, Number(viewingReceipt.amount ?? 0)) : null;
  const viewingStatus = (viewingReceipt?.status || '').toLowerCase();
  const viewingIsPaid = viewingStatus === 'paid';

  return (
    <main className="flex-1 p-8 lg:p-12 overflow-y-auto bg-[#F8FAFC] h-full font-sans relative">
      <div className="absolute top-0 left-0 w-full h-96 overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-amber-200/40 rounded-full blur-3xl mix-blend-multiply opacity-70"></div>
      </div>

      <header className="mb-10 flex flex-col md:flex-row md:justify-between md:items-end gap-4 relative z-10">
        <div>
          <h2 className="text-4xl font-black text-slate-800 tracking-tight">Finance and Billing</h2>
          <p className="text-slate-500 mt-2 font-medium">Draft to finalize to student-visible monthly billing flow.</p>
        </div>

        <div className="flex gap-3">
          <form action={runDraftGenerationNow}>
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-4 rounded-3xl transition-all shadow-md hover:shadow-lg">
              Generate Upcoming Month Drafts
            </button>
          </form>
        </div>
      </header>

      {financeError && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {financeError === 'finalize-update-failed'
            ? 'Finalize failed to update invoice status/amount. Please retry once.'
            : 'Finalize warning occurred. Please retry once.'}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10 relative z-10">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-emerald-100 flex justify-between items-center">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Collected</p>
            <p className="text-4xl font-black text-emerald-500">Rs {totalCollected.toLocaleString('en-IN')}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-2xl">IN</div>
        </div>
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-amber-100 flex justify-between items-center">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Outstanding Dues</p>
            <p className="text-4xl font-black text-amber-500">Rs {outstandingDues.toLocaleString('en-IN')}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-2xl">DUE</div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden relative z-10">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-lg font-black text-slate-800">Master Invoice Ledger</h3>
          
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white text-slate-400 text-xs uppercase tracking-widest border-b border-slate-100">
              <tr>
                <th className="p-5">Student</th>
                <th className="p-5">Bill Month</th>
                <th className="p-5">Base Rent</th>
                <th className="p-5">Electricity</th>
                <th className="p-5">Custom Service</th>
                <th className="p-5">Total</th>
                <th className="p-5">Due</th>
                <th className="p-5">Paid Date and Time</th>
                <th className="p-5">Status</th>
                <th className="p-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm bg-white">
              {typedInvoices.map((inv) => {
                const invWithCachedNotes = {
                  ...inv,
                  additional_notes: breakdownNotesByInvoiceId[inv.id] || inv.additional_notes || null,
                  paid_at: inv.paid_at || paidAtByInvoiceId[inv.id] || null,
                };
                const isDraft = (inv.status || '').toLowerCase() === 'draft';
                const isPaid = (inv.status || '').toLowerCase() === 'paid';
                const studentName = inv.student_admissions?.full_name || 'Unknown Student';
                const breakdown = resolveInvoiceBreakdown(invWithCachedNotes, Number(inv.amount ?? 0));
                const baseRent = breakdown.baseRent;
                const electricityUnits = breakdown.electricityUnits;
                const electricityRate = breakdown.electricityRate;
                const electricityAmount = breakdown.electricityAmount;
                const customAmount = breakdown.customServiceAmount;
                const customName = breakdown.customServiceName;
                const delayInfo = delayTag(invWithCachedNotes as InvoiceRow);
                const cached = studentElectricityCache[Number(inv.student_id)];
                const studentElectricityUnits = Number(inv.student_admissions?.electricity_units ?? cached?.units ?? 0);
                const studentElectricityRate = Number(inv.student_admissions?.electricity_rate_per_unit ?? cached?.ratePerUnit ?? 0);

                if (isDraft) {
                  const resolvedInitialMeterUnits = Number.isFinite(studentElectricityUnits) && studentElectricityUnits > 0
                    ? studentElectricityUnits
                    : electricityUnits;
                  const resolvedRate = Number.isFinite(studentElectricityRate) && studentElectricityRate > 0
                    ? studentElectricityRate
                    : electricityRate;
                  const resolvedCurrentMeterUnits = Number(inv.electricity_units ?? 0) > 0
                    ? Number(inv.electricity_units ?? 0)
                    : 0;
                  return (
                    <FinanceDraftRow
                      key={inv.id}
                      invoiceId={inv.id}
                      studentName={studentName}
                      billMonthLabel={formatBillMonth(inv.billing_month || inv.due_date)}
                      baseRent={baseRent}
                      dueDateLabel={inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                      initialMeterUnits={resolvedInitialMeterUnits}
                      initialElectricityRate={resolvedRate}
                      initialCurrentMeterUnits={resolvedCurrentMeterUnits}
                      initialCustomServices={breakdown.services}
                      additionalNotes={breakdown.plainNotes}
                      finalizeBillAction={finalizeBill}
                      deleteInvoiceAction={deleteInvoice}
                    />
                  );
                }

                return (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors align-top">
                    <td className="p-5 font-bold text-slate-900 min-w-48">{studentName}</td>
                    <td className="p-5 font-medium text-slate-700 min-w-36">{formatBillMonth(inv.billing_month || inv.due_date)}</td>
                    <td className="p-5 min-w-36">
                      <span className="font-bold text-slate-800">Rs {baseRent.toLocaleString('en-IN')}</span>
                      <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">From Admission Advance Rent</p>
                    </td>
                    <td className="p-5 min-w-48">
                      <div>
                        <p className="font-bold text-slate-800">{electricityUnits} units</p>
                        <p className="text-xs text-slate-500">Rs {electricityRate}/unit = Rs {electricityAmount.toLocaleString('en-IN')}</p>
                      </div>
                    </td>
                    <td className="p-5 min-w-56">
                      <div>
                        <p className="font-bold text-slate-800">{customName || '-'}</p>
                        <p className="text-xs text-slate-500">Rs {customAmount.toLocaleString('en-IN')}</p>
                      </div>
                    </td>
                    <td className="p-5 font-black text-slate-900 text-base min-w-36">Rs {Number(inv.amount || 0).toLocaleString('en-IN')}</td>
                    <td className="p-5 text-slate-700 min-w-36">
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                    </td>
                    <td className="p-5 min-w-52">
                      {invWithCachedNotes.paid_at ? (
                        <>
                          <p className="font-semibold text-slate-800">{new Date(invWithCachedNotes.paid_at).toLocaleString('en-IN')}</p>
                          {delayInfo && <p className={`text-xs mt-1 font-bold ${delayInfo.startsWith('Delayed') ? 'text-rose-600' : 'text-emerald-600'}`}>{delayInfo}</p>}
                        </>
                      ) : (
                        <span className="text-slate-400">Not paid</span>
                      )}
                    </td>
                    <td className="p-5">
                      <span className={`text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider ${
                        isPaid ? 'text-emerald-700 bg-emerald-100' : 'text-amber-700 bg-amber-100'
                      }`}>
                        {inv.status || 'Pending'}
                      </span>
                    </td>
                    <td className="p-5 text-right min-w-60">
                      <div className="flex justify-end items-center gap-2 flex-wrap">
                        <Link
                          href={`/finance?receipt=${inv.id}`}
                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] uppercase tracking-wider px-4 py-2 rounded-lg transition-colors shadow-sm"
                        >
                          Details
                        </Link>
                        {!isPaid && (
                          <form action={markAsPaid}>
                            <input type="hidden" name="invoice_id" value={inv.id} />
                            <button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[10px] uppercase tracking-wider px-4 py-2 rounded-lg transition-colors shadow-sm">
                              Mark Paid
                            </button>
                          </form>
                        )}

                        {isPaid && (
                          <Link href={`/finance/receipt/${inv.id}`} className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-[10px] uppercase tracking-wider px-4 py-2 rounded-lg transition-colors shadow-sm">
                            Receipt PDF
                          </Link>
                        )}

                        <form action={deleteInvoice}>
                          <input type="hidden" name="invoice_id" value={inv.id} />
                          <button type="submit" className="text-slate-400 hover:text-rose-500 bg-white border border-slate-200 hover:border-rose-200 font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded-lg transition-colors shadow-sm" title="Delete Invoice">
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {typedInvoices.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-400 font-medium">
                    No invoices generated yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewingReceipt && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative border border-slate-200">
            <div className="h-4 w-full bg-indigo-600"></div>

            <div className="p-8">
              <div className="flex justify-between items-start mb-8 border-b border-dashed border-slate-200 pb-6">
                <div>
                  <h3 className="text-2xl font-black text-indigo-600 tracking-tighter">HMP ADMIN</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    {viewingIsPaid ? 'Payment Receipt' : 'Finalized Pending Bill Details'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-800">
                    {viewingIsPaid ? 'RCPT' : 'BILL'}-{viewingReceipt.id.toString().padStart(5, '0')}
                  </p>
                  <p className="text-[10px] font-medium text-slate-400 mt-1">{new Date().toLocaleDateString('en-IN')}</p>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Received From</p>
                  <p className="text-lg font-black text-slate-800">{rStudent?.full_name || 'Unknown Student'}</p>
                  <p className="text-xs text-slate-500 font-medium mt-1">{rStudent?.phone || 'N/A'}</p>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Billing Split</p>
                  <p className="text-sm text-slate-700">Base Rent: Rs {Number(receiptBreakdown?.baseRent ?? 0).toLocaleString('en-IN')}</p>
                  <p className="text-sm text-slate-700">Electricity: Rs {Number(receiptBreakdown?.electricityAmount ?? 0).toLocaleString('en-IN')}</p>
                  {(receiptBreakdown?.services || []).map((service, idx) => (
                    <p key={`receipt-service-${idx}`} className="text-sm text-slate-700">
                      Service: {service.name} (Rs {Number(service.amount ?? 0).toLocaleString('en-IN')})
                    </p>
                  ))}
                  <p className="text-sm text-slate-700">Custom Service Total: Rs {Number(receiptBreakdown?.customServiceAmount ?? 0).toLocaleString('en-IN')}</p>
                  <p className="text-xs text-slate-500 mt-2">
                    Due Date: {viewingReceipt.due_date ? new Date(viewingReceipt.due_date).toLocaleDateString('en-IN') : '-'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Status: {viewingReceipt.status || 'Pending'}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Paid At: {viewingReceipt.paid_at ? new Date(viewingReceipt.paid_at).toLocaleString('en-IN') : 'Not paid yet'}
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-end border-t border-slate-200 pt-6">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                    {viewingIsPaid ? 'Amount Paid' : 'Total Bill Amount'}
                  </p>
                  <p className={`text-4xl font-black tracking-tighter ${viewingIsPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                    Rs {Number(viewingReceipt.amount || 0).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 flex justify-between items-center border-t border-slate-100">
              <Link href="/finance" className="text-slate-500 hover:text-slate-800 font-bold text-xs uppercase tracking-wider px-4 py-2 transition-colors">
                Close
              </Link>
              <Link href="/finance" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider px-6 py-3 rounded-xl transition-colors shadow-sm">
                Done
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
