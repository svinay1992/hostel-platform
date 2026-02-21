import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

// This forces the API to fetch fresh data every time you click download
export const dynamic = 'force-dynamic';

export async function GET() {
  
  // 1. Fetch all invoices with the student names attached
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, amount, invoice_date, due_date, status, students(users(name))')
    .order('invoice_date', { ascending: false });

  if (error || !invoices) {
    return new NextResponse('Failed to fetch data', { status: 500 });
  }

  // 2. Build the CSV (Excel) Headers
  let csvContent = 'Invoice ID,Student Name,Amount (INR),Invoice Date,Due Date,Status\n';

  // 3. Loop through the data and build the rows
  invoices.forEach((inv: any) => {
    // Safely grab the name
    const studentName = inv.students?.users?.name || inv.students?.[0]?.users?.name || 'Unknown';
    
    // Construct the row (using quotes around the name just in case they have a comma in their name)
    csvContent += `INV-${inv.id},"${studentName}",${inv.amount},${inv.invoice_date},${inv.due_date},${inv.status}\n`;
  });

  // 4. Return the file to the browser as a downloadable attachment!
  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="Hostel_Finance_Ledger.csv"',
    },
  });
}