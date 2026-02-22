import { supabase } from '../../../../lib/supabase'; // Adjust path if needed
import Link from 'next/link';

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  
  const resolvedParams = await params;
  const invoiceId = resolvedParams.id;

  // 1. FETCH DATA (Now looking at the new student_admissions table)
  const { data: invoice } = await supabase
    .from('invoices')
    .select(`
      *,
      student_admissions (
        full_name, email, phone, room_number, bed_number
      )
    `)
    .eq('id', invoiceId)
    .single();

  if (!invoice) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-2xl font-bold text-red-600">Receipt Not Found</h2>
        <Link href="/finance" className="text-indigo-600 mt-4 inline-block hover:underline">&larr; Back to Finance</Link>
      </div>
    );
  }

  // 2. EXTRACT DATA SAFELY (No more confusing nested arrays!)
  const studentData: any = invoice.student_admissions;
  
  const studentName = studentData?.full_name || 'Unknown Student';
  const email = studentData?.email || 'N/A';
  const phone = studentData?.phone || 'N/A';
  const roomNumber = studentData?.room_number || 'N/A';
  const bedNumber = studentData?.bed_number || 'N/A';

  // 3. YOUR EXACT ORIGINAL UI LAYOUT
  return (
    <div className="min-h-screen bg-gray-200 p-8 flex justify-center font-sans">
      
      {/* The Printable A4 Area */}
      <div className="bg-white w-full max-w-2xl shadow-2xl p-12 border border-gray-300 relative">
        
        {/* Print Button (Hidden when actually printing) */}
        <div className="absolute top-4 right-4 print:hidden flex items-center gap-4">
          <Link href="/finance" className="text-gray-500 hover:text-gray-800 text-sm font-bold transition-colors">
            &larr; Back
          </Link>
          {/* SAFE PRINT TRICK: Styled exactly like your button but works in Server Components */}
          <a 
            href="javascript:window.print()"
            className="bg-indigo-600 text-white px-4 py-2 rounded shadow hover:bg-indigo-700 font-bold text-sm transition-colors cursor-pointer inline-block"
          >
            🖨️ Print / Save PDF
          </a>
        </div>

        {/* Receipt Header */}
        <div className="flex justify-between items-start border-b-2 border-gray-100 pb-8 mb-8">
          <div>
            <h1 className="text-4xl font-black text-indigo-700 tracking-tighter">HMP</h1>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Hostel Management Pro</p>
            <p className="text-sm text-gray-600 mt-4">123 University Road<br/>Tech District, City 400001<br/>contact@hmp-admin.com</p>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-extrabold text-gray-200 uppercase tracking-widest">Receipt</h2>
            <p className="text-sm font-bold text-gray-800 mt-2">Receipt No: <span className="text-gray-500 font-medium">#INV-{invoice.id.toString().padStart(4, '0')}</span></p>
            <p className="text-sm font-bold text-gray-800">Date: <span className="text-gray-500 font-medium">{new Date(invoice.invoice_date || invoice.created_at).toLocaleDateString('en-IN')}</span></p>
          </div>
        </div>

        {/* Billed To Section */}
        <div className="mb-10">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Billed To</h3>
          <p className="text-xl font-bold text-gray-900">{studentName}</p>
          <p className="text-sm text-gray-600 mt-1">Room {roomNumber} • Bed {bedNumber}</p>
          <p className="text-sm text-gray-600">{phone} • {email}</p>
        </div>

        {/* Payment Details Table */}
        <table className="w-full text-left mb-8">
          <thead className="bg-gray-50 border-y border-gray-200 text-xs uppercase text-gray-600 font-bold tracking-wider">
            <tr>
              <th className="py-3 px-4">Description</th>
              <th className="py-3 px-4 text-center">Due Date</th>
              <th className="py-3 px-4 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="text-sm border-b border-gray-200 divide-y divide-gray-100">
            <tr>
              <td className="py-4 px-4 font-bold text-gray-800">Monthly Hostel Rent</td>
              <td className="py-4 px-4 text-center text-gray-600">{new Date(invoice.due_date).toLocaleDateString('en-IN')}</td>
              <td className="py-4 px-4 text-right font-bold text-gray-900">₹{Number(invoice.amount).toLocaleString('en-IN')}</td>
            </tr>
          </tbody>
        </table>

        {/* Total & Status */}
        <div className="flex justify-between items-end">
          <div>
            <div className={`inline-flex items-center justify-center px-4 py-2 rounded font-extrabold text-lg uppercase tracking-wider border-2 ${invoice.status === 'Paid' ? 'border-green-500 text-green-600' : 'border-red-500 text-red-600'}`}>
              {invoice.status}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Paid</p>
            <p className="text-4xl font-black text-gray-900">₹{Number(invoice.amount).toLocaleString('en-IN')}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-gray-100 text-center">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Thank you for your timely payment</p>
          <p className="text-xs text-gray-400 italic">This is a system-generated document and does not require a physical signature.</p>
        </div>

      </div>

      {/* CSS to format the page when actually printing */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body { background-color: white; }
          .print\\:hidden { display: none !important; }
          .shadow-2xl { box-shadow: none !important; }
          .border { border: none !important; }
        }
      `}} />

    </div>
  );
}