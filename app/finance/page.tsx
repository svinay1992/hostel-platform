// Cache buster
export const dynamic = 'force-dynamic';

import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ receipt?: string }> }) {
  
  // Resolve URL parameters for the Receipt Modal
  const resolvedParams = await searchParams;
  const receiptId = resolvedParams?.receipt;

  // 1. FETCH ALL INVOICES WITH STUDENT NAMES
  const { data: invoices, error: fetchError } = await supabase
    .from('invoices')
    .select(`
      *,
      student_admissions ( full_name, phone, room_number, bed_number )
    `)
    .order('created_at', { ascending: false });

  if (fetchError) console.error("FETCH ERROR:", fetchError.message);

  // Math for the top cards
  const totalCollected = invoices?.filter(inv => inv.status === 'Paid').reduce((sum, inv) => sum + Number(inv.amount), 0) || 0;
  const outstandingDues = invoices?.filter(inv => inv.status === 'Pending').reduce((sum, inv) => sum + Number(inv.amount), 0) || 0;

  // 2. SERVER ACTION: AUTO-BILL ALL ACTIVE STUDENTS
  async function autoBillStudents() {
    'use server';
    
    const { data: activeStudents } = await supabase
      .from('student_admissions')
      .select(`id, bed_id, beds ( monthly_rent )`)
      .eq('status', 'ACTIVE');

    if (!activeStudents || activeStudents.length === 0) return;

    // Set due date to the 5th of next month
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + 1);
    dueDate.setDate(5);
    const formattedDueDate = dueDate.toISOString().slice(0, 10);

    const newInvoices = [];

    for (const student of activeStudents) {
      const bedData = Array.isArray(student.beds) ? student.beds[0] : student.beds;
      const rentAmount = bedData?.monthly_rent || 0;

      if (rentAmount > 0) {
        newInvoices.push({
          student_id: student.id,
          amount: rentAmount,
          due_date: formattedDueDate,
          status: 'Pending'
        });
      }
    }

    if (newInvoices.length > 0) {
      const { error } = await supabase.from('invoices').insert(newInvoices);
      if (error) console.error("AUTO-BILL ERROR:", error.message);
    }

    revalidatePath('/finance');
    revalidatePath('/'); 
  }

  // 3. SERVER ACTION: MARK AS PAID
  async function markAsPaid(formData: FormData) {
    'use server';
    const invoice_id = formData.get('invoice_id') as string;
    
    await supabase.from('invoices').update({ status: 'Paid' }).eq('id', invoice_id);
    
    revalidatePath('/finance');
    revalidatePath('/'); 
  }

  // 4. SERVER ACTION: DELETE INVOICE
  async function deleteInvoice(formData: FormData) {
    'use server';
    const invoice_id = formData.get('invoice_id') as string;
    
    await supabase.from('invoices').delete().eq('id', invoice_id);
    
    revalidatePath('/finance');
    revalidatePath('/');
  }

  // Find specific invoice for the Receipt Modal
  const viewingReceipt = receiptId ? invoices?.find((inv: any) => inv.id.toString() === receiptId) : null;
  const rStudent = viewingReceipt?.student_admissions;

  return (
    <main className="flex-1 p-8 lg:p-12 overflow-y-auto bg-[#F8FAFC] h-full font-sans relative">
      
      {/* Trendy Background */}
      <div className="absolute top-0 left-0 w-full h-96 overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-amber-200/40 rounded-full blur-3xl mix-blend-multiply opacity-70"></div>
      </div>

      <header className="mb-10 flex flex-col md:flex-row md:justify-between md:items-end gap-4 relative z-10">
        <div>
          <h2 className="text-4xl font-black text-slate-800 tracking-tight">💰 Finance & Billing</h2>
          <p className="text-slate-500 mt-2 font-medium">Manage student invoices and track revenue.</p>
        </div>
        
        <div className="flex gap-3">
          <form action={autoBillStudents}>
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-4 rounded-3xl transition-all shadow-md hover:shadow-lg flex items-center gap-2">
              <span>⚡</span> Auto-Bill All Students
            </button>
          </form>
        </div>
      </header>

      {/* QUICK STATS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10 relative z-10">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-emerald-100 flex justify-between items-center">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Collected</p>
            <p className="text-4xl font-black text-emerald-500">₹{totalCollected.toLocaleString('en-IN')}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-2xl">📈</div>
        </div>
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-amber-100 flex justify-between items-center">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Outstanding Dues</p>
            <p className="text-4xl font-black text-amber-500">₹{outstandingDues.toLocaleString('en-IN')}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-2xl">⏳</div>
        </div>
      </div>

      {/* MASTER INVOICE LEDGER */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden relative z-10">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="text-lg font-black text-slate-800">Master Invoice Ledger</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white text-slate-400 text-xs uppercase tracking-widest border-b border-slate-100">
              <tr>
                <th className="p-6">Student Name</th>
                <th className="p-6">Amount</th>
                <th className="p-6">Due Date</th>
                <th className="p-6">Status</th>
                <th className="p-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm bg-white">
              {invoices?.map((inv: any) => {
                const isPaid = inv.status === 'Paid';
                const studentName = inv.student_admissions?.full_name || 'Unknown Student';

                return (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-6 font-bold text-slate-900 text-base">
                      {studentName}
                    </td>
                    <td className="p-6 font-black text-slate-800 text-lg">
                      ₹{Number(inv.amount).toLocaleString('en-IN')}
                    </td>
                    <td className="p-6 font-medium text-slate-600">
                      {new Date(inv.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="p-6">
                      <span className={`text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider ${isPaid ? 'text-emerald-700 bg-emerald-100' : 'text-amber-700 bg-amber-100'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-6 text-right">
                      <div className="flex justify-end items-center gap-2">
                        
                        {/* THE RECEIPT BUTTON (Shows only if paid) */}
                        {isPaid && (
                         <Link href={`/finance/receipt/${inv.id}`} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] uppercase tracking-wider px-4 py-2 rounded-lg transition-colors shadow-sm flex items-center gap-1">
  📄 Receipt
</Link>
                        )}

                        {/* MARK AS PAID BUTTON (Shows only if pending) */}
                        {!isPaid && (
                          <form action={markAsPaid}>
                            <input type="hidden" name="invoice_id" value={inv.id} />
                            <button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[10px] uppercase tracking-wider px-4 py-2 rounded-lg transition-colors shadow-sm">
                              Mark Paid
                            </button>
                          </form>
                        )}

                        {/* DELETE BUTTON */}
                        <form action={deleteInvoice}>
                          <input type="hidden" name="invoice_id" value={inv.id} />
                          <button type="submit" className="text-slate-400 hover:text-rose-500 bg-white border border-slate-200 hover:border-rose-200 font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded-lg transition-colors shadow-sm" title="Delete Invoice">
                            ✕
                          </button>
                        </form>

                      </div>
                    </td>
                  </tr>
                );
              })}

              {(!invoices || invoices.length === 0) && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400 font-medium">
                    No invoices generated yet. Click "Auto-Bill All Students" to begin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================= */}
      {/* MODAL: DIGITAL RECEIPT */}
      {/* ========================================= */}
      {viewingReceipt && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex justify-center items-center p-4">
          
          {/* Receipt Container */}
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative border border-slate-200">
            
            {/* Header pattern */}
            <div className="h-4 w-full bg-indigo-600" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px)'}}></div>

            <div className="p-8">
              <div className="flex justify-between items-start mb-8 border-b border-dashed border-slate-200 pb-6">
                <div>
                  <h3 className="text-2xl font-black text-indigo-600 tracking-tighter">HMP ADMIN</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Payment Receipt</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-800">RCPT-{viewingReceipt.id.toString().padStart(5, '0')}</p>
                  <p className="text-[10px] font-medium text-slate-400 mt-1">{new Date().toLocaleDateString('en-IN')}</p>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Received From</p>
                  <p className="text-lg font-black text-slate-800">{rStudent?.full_name || 'Unknown Student'}</p>
                  <p className="text-xs text-slate-500 font-medium mt-1">📞 {rStudent?.phone || 'N/A'}</p>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Accommodation</p>
                    <p className="font-bold text-slate-800 text-sm">Room {rStudent?.room_number || 'N/A'} • Bed {rStudent?.bed_number || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-end border-t border-slate-200 pt-6 relative">
                
                {/* Paid Stamp Effect */}
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-4 rotate-[-15deg] border-4 border-emerald-500 text-emerald-500 rounded-lg px-4 py-1 text-2xl font-black tracking-widest opacity-30 pointer-events-none">
                  PAID
                </div>

                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Amount Paid</p>
                  <p className="text-4xl font-black text-emerald-600 tracking-tighter">₹{Number(viewingReceipt.amount).toLocaleString('en-IN')}</p>
                </div>
                
              </div>
            </div>

            {/* Footer Actions */}
            <div className="bg-slate-50 p-4 flex justify-between items-center border-t border-slate-100">
               <Link href="/finance" className="text-slate-500 hover:text-slate-800 font-bold text-xs uppercase tracking-wider px-4 py-2 transition-colors">
                 Close
               </Link>
               {/* Browser Print trick! User can just hit this to print the window */}
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