import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';

export default async function FinancePage() {
  
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, amount, invoice_date, due_date, status, students(users(name))')
    .order('due_date', { ascending: false });

  const totalCollected = invoices?.filter(i => i.status === 'Paid').reduce((sum, i) => sum + Number(i.amount), 0) || 0;
  const totalPending = invoices?.filter(i => i.status === 'Pending').reduce((sum, i) => sum + Number(i.amount), 0) || 0;

  async function generateMonthlyRent() {
    'use server';
    
    const { data: allStudents, error: fetchError } = await supabase
      .from('students')
      .select('id, bed_id, beds(monthly_rent)');

    if (fetchError) {
      console.error("Database fetch error:", fetchError);
      return;
    }

    const activeStudents = allStudents?.filter(s => s.bed_id !== null) || [];

    if (activeStudents.length > 0) {
      
      // Formatting dates EXACTLY how PostgreSQL likes them (YYYY-MM-DD)
      const todayString = new Date().toISOString().split('T')[0]; 
      
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const dueString = futureDate.toISOString().split('T')[0];

      const newInvoices = activeStudents.map(student => {
        let bedRent = 6000;
        if (Array.isArray(student.beds) && student.beds.length > 0) {
          bedRent = student.beds[0].monthly_rent;
        } else if (student.beds && !Array.isArray(student.beds)) {
          bedRent = (student.beds as any).monthly_rent;
        }

        return {
          student_id: student.id,
          invoice_date: todayString, // Perfectly formatted date
          amount: bedRent || 6000, 
          due_date: dueString,       // Perfectly formatted date
          status: 'Pending'
        };
      });

      const { error: insertError } = await supabase.from('invoices').insert(newInvoices);
      
      if (insertError) {
        console.error("Failed to generate invoices:", insertError);
      } else {
        console.log(`Successfully generated ${newInvoices.length} invoices!`);
      }
      
      revalidatePath('/finance');
      revalidatePath('/'); 
      revalidatePath('/portal'); 
    } else {
      console.log("No active students found! Admission required first.");
    }
  }

  async function markAsPaid(formData: FormData) {
    'use server';
    const invoice_id = formData.get('invoice_id') as string;
    await supabase.from('invoices').update({ status: 'Paid' }).eq('id', invoice_id);
    
    revalidatePath('/finance');
    revalidatePath('/');
    revalidatePath('/portal');
  }

  return (
    <main className="flex-1 p-10 overflow-y-auto bg-gray-50 h-full font-sans">
      <header className="mb-10 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">💰 Finance & Billing</h2>
          <p className="text-gray-500 mt-1">Manage student invoices and track revenue.</p>
        </div>
        
        <form action={generateMonthlyRent}>
          <button type="submit" className="bg-indigo-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-indigo-700 transition-colors shadow-md flex items-center gap-2">
            <span className="text-xl">⚡</span> Auto-Bill All Students
          </button>
        </form>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-100 flex justify-between items-center">
          <div>
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Total Collected</p>
            <p className="text-3xl font-extrabold text-green-600">₹{totalCollected.toLocaleString('en-IN')}</p>
          </div>
          <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center text-green-500 text-2xl">📈</div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-orange-100 flex justify-between items-center">
          <div>
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Outstanding Dues</p>
            <p className="text-3xl font-extrabold text-orange-500">₹{totalPending.toLocaleString('en-IN')}</p>
          </div>
          <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center text-orange-500 text-2xl">⏳</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">Master Invoice Ledger</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
              <tr>
                <th className="p-5">Student Name</th>
                <th className="p-5">Amount</th>
                <th className="p-5">Due Date</th>
                <th className="p-5">Status</th>
                <th className="p-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {invoices?.map((invoice: any) => (
                <tr key={invoice.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="p-5 font-bold text-gray-900">
                    {invoice.students?.users?.name || (invoice.students?.[0]?.users?.name) || 'Unknown Student'}
                  </td>
                  <td className="p-5 font-extrabold text-gray-700">
                    ₹{Number(invoice.amount).toLocaleString('en-IN')}
                  </td>
                  <td className="p-5 text-gray-600 font-medium">
                    {new Date(invoice.due_date).toLocaleDateString('en-IN')}
                  </td>
                  <td className="p-5">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      invoice.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="p-5 text-right">
                    {invoice.status === 'Pending' ? (
                      <form action={markAsPaid}>
                        <input type="hidden" name="invoice_id" value={invoice.id} />
                        <button type="submit" className="text-xs bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-sm">
                          Mark Paid
                        </button>
                      </form>
                    ) : (
                      <span className="text-gray-300 font-bold italic text-xs px-4">Settled</span>
                    )}
                  </td>
                </tr>
              ))}

              {(!invoices || invoices.length === 0) && (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-gray-400 italic">
                    No invoices generated yet. Click the Auto-Bill button above!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}