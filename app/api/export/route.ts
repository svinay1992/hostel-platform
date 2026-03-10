import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type ExportInvoice = {
  id: number;
  amount: number | null;
  due_date: string | null;
  status: string | null;
  billing_month: string | null;
  paid_at: string | null;
  base_rent: number | null;
  electricity_units: number | null;
  electricity_rate: number | null;
  electricity_amount: number | null;
  custom_service_name: string | null;
  custom_service_amount: number | null;
  student_admissions?: { full_name: string | null } | null;
};

export async function GET() {
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      id, amount, due_date, status, billing_month, paid_at,
      base_rent, electricity_units, electricity_rate, electricity_amount,
      custom_service_name, custom_service_amount,
      student_admissions ( full_name )
    `)
    .order('created_at', { ascending: false });

  if (error || !invoices) {
    return new NextResponse('Failed to fetch data', { status: 500 });
  }

  let csvContent = 'Invoice ID,Student Name,Billing Month,Base Rent,Electricity Units,Electricity Rate,Electricity Amount,Custom Service,Custom Amount,Total,Due Date,Paid At,Status\n';

  (invoices as ExportInvoice[]).forEach((inv) => {
    const studentName = inv.student_admissions?.full_name || 'Unknown';
    const month = inv.billing_month || '';
    const paidAt = inv.paid_at || '';
    csvContent += `INV-${inv.id},"${studentName}",${month},${inv.base_rent || 0},${inv.electricity_units || 0},${inv.electricity_rate || 0},${inv.electricity_amount || 0},"${inv.custom_service_name || ''}",${inv.custom_service_amount || 0},${inv.amount || 0},${inv.due_date || ''},${paidAt},${inv.status || ''}\n`;
  });

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="Hostel_Finance_Ledger.csv"',
    },
  });
}
