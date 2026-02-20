import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';

export default async function FinancePage() {
  
  const { data: invoices } = await supabase
    .from('invoices')
    .select(`id, amount, status, invoice_date, due_date, students ( users (name) )`)
    .order('invoice_date', { ascending: false });

  const totalCollected = invoices?.filter(i => i.status === 'Paid').reduce((sum, i) => sum + Number(i.amount), 0) || 0;
  const totalPending = invoices?.filter(i => i.status === 'Pending' || i.status === 'Overdue').reduce((sum, i) => sum + Number(i.amount), 0) || 0;

  // 🚀 THE UPGRADED AUTOMATION SCRIPT (WITH SAFETY CHECK)
  async function generateMonthlyRent() {
    'use server';

    const { data: activeStudents } = await supabase.from('students').select('id, beds(monthly_rent)');
    if (!activeStudents) return;

    const today = new Date();
    
    // SAFETY CHECK: Get the 1st day of the current month
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];

    // SAFETY CHECK: Find all invoices already created this month
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('student_id')
      .gte('invoice_date', startOfMonth);
    
    const alreadyBilledStudentIds = existingInvoices?.map(i => i.student_id) || [];

    // SAFETY CHECK: Only keep students who are NOT in the alreadyBilled list
    const studentsToBill = activeStudents.filter((student: any) => !alreadyBilledStudentIds.includes(student.id));

    // If everyone is already billed, stop the function!
    if (studentsToBill.length === 0) return; 

    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    const newInvoices = studentsToBill.map((student: any) => ({
      student_id: student.id,
      amount: student.beds?.monthly_rent || 0,
      invoice_date: today.toISOString().split('T')[0],
      due_date: nextWeek.toISOString().split('T')[0],
      status: 'Pending'
    }));

    await supabase.from('invoices').insert(newInvoices);

    revalidatePath('/finance');
    revalidatePath('/');
  }

  async function markAsPaid(formData: FormData) {
    'use server';
    const invoiceId = formData.get('invoice_id');
    await supabase.from('invoices').update({ status: 'Paid', payment_method: 'UPI' }).eq('id', invoiceId);
    revalidatePath('/finance');
    revalidatePath('/');
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      
     

      <main className="flex-1 p-10 overflow-y-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-800">Finance & Billing</h2>
            <p className="text-gray-500 mt-1">Manage rent collection and invoices.</p>
          </div>
          <form action={generateMonthlyRent}>
            <button type="submit" className="bg-green-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-700 transition-colors shadow-sm flex items-center gap-2">
              <span>⚡</span> Generate Rent Invoices
            </button>
          </form>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Total Collected</h3>
            <p className="text-4xl font-bold text-green-600 mt-2">₹{totalCollected.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Total Pending & Overdue</h3>
            <p className="text-4xl font-bold text-red-500 mt-2">₹{totalPending.toLocaleString('en-IN')}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-xl font-bold text-gray-800">Master Invoice Ledger</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wider">
                  <th className="p-4 font-semibold">Invoice ID</th>
                  <th className="p-4 font-semibold">Student Name</th>
                  <th className="p-4 font-semibold">Amount</th>
                  <th className="p-4 font-semibold">Due Date</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices?.map((invoice: any) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="p-4 text-gray-500 font-mono text-sm">#INV-{invoice.id.toString().padStart(4, '0')}</td>
                    <td className="p-4 font-medium text-gray-800">{invoice.students?.users?.name}</td>
                    <td className="p-4 font-semibold text-gray-600">₹{Number(invoice.amount).toLocaleString('en-IN')}</td>
                    <td className="p-4 text-gray-500">{new Date(invoice.due_date).toLocaleDateString('en-IN')}</td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        invoice.status === 'Paid' ? 'bg-green-100 text-green-700' :
                        invoice.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>{invoice.status}</span>
                    </td>
                    <td className="p-4">
                      {invoice.status !== 'Paid' && (
                        <form action={markAsPaid}>
                          <input type="hidden" name="invoice_id" value={invoice.id} />
                          <button type="submit" className="text-sm bg-indigo-50 text-indigo-700 font-bold py-1 px-3 rounded hover:bg-indigo-100">
                            Mark Paid
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}