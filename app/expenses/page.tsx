// Cache buster
export const dynamic = 'force-dynamic';

import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { addActivityLog } from '../../lib/activity-log-cache';

// In Next.js, we use searchParams to figure out if we are in "Edit" mode
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  
  const resolvedParams = await searchParams;
  const editId = resolvedParams?.edit;

  // 1. READ: Fetch all expenses
  const { data: expenses } = await supabase
    .from('expenses')
    .select('*')
    .neq('category', 'Inventory Purchase')
    .order('expense_date', { ascending: false });

  // 2. READ (Single): If editing, fetch that specific record
  let editRecord = null;
  if (editId) {
    editRecord = expenses?.find(e => e.id.toString() === editId);
  }

  // Calculate Total
  const totalExpenses = expenses?.reduce((sum, exp) => sum + Number(exp.amount), 0) || 0;

  // 3. CREATE: Server Action
  async function addExpense(formData: FormData) {
    'use server';
    const title = formData.get('title') as string;
    const category = formData.get('category') as string;
    const amount = parseFloat(formData.get('amount') as string);
    const expense_date = formData.get('expense_date') as string;

    await supabase.from('expenses').insert([{ title, category, amount, expense_date }]);
    await addActivityLog({
      module: 'Expenses',
      action: 'Expense Added',
      details: `${title} (${category}) Rs ${amount} on ${expense_date}`,
      actor: 'admin',
      level: 'info',
    });
    revalidatePath('/expenses');
    revalidatePath('/'); // Update dashboard!
  }

  // 4. UPDATE: Server Action
  async function updateExpense(formData: FormData) {
    'use server';
    const id = formData.get('id') as string;
    const title = formData.get('title') as string;
    const category = formData.get('category') as string;
    const amount = parseFloat(formData.get('amount') as string);
    const expense_date = formData.get('expense_date') as string;

    const { data: existingExpense } = await supabase
      .from('expenses')
      .select('title')
      .eq('id', id)
      .single();

    await supabase.from('expenses').update({ title, category, amount, expense_date }).eq('id', id);
    await addActivityLog({
      module: 'Expenses',
      action: 'Expense Updated',
      details: `${existingExpense?.title || `Expense #${id}`} updated to Rs ${amount} (${category})`,
      actor: 'admin',
      level: 'warning',
    });
    
    revalidatePath('/expenses');
    revalidatePath('/');
    redirect('/expenses'); // Clear the ?edit= URL parameter
  }

  // 5. DELETE: Server Action
  async function deleteExpense(formData: FormData) {
    'use server';
    const id = formData.get('id') as string;
    const { data: existingExpense } = await supabase
      .from('expenses')
      .select('title, amount')
      .eq('id', id)
      .single();
    await supabase.from('expenses').delete().eq('id', id);
    await addActivityLog({
      module: 'Expenses',
      action: 'Expense Deleted',
      details: `${existingExpense?.title || `Expense #${id}`} deleted (Rs ${Number(existingExpense?.amount || 0)})`,
      actor: 'admin',
      level: 'critical',
    });
    revalidatePath('/expenses');
    revalidatePath('/');
  }

  return (
    <main className="flex-1 p-8 lg:p-12 overflow-y-auto bg-[#F8FAFC] h-full font-sans relative">
      
      {/* Trendy Aurora Background */}
      <div className="absolute top-0 left-0 w-full h-96 overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-rose-200/40 rounded-full blur-3xl mix-blend-multiply opacity-70"></div>
      </div>

      <header className="mb-10 flex justify-between items-end relative z-10">
        <div>
          <h2 className="text-4xl font-black text-slate-800 tracking-tight">📉 Expense Ledger</h2>
          <p className="text-slate-500 mt-2 font-medium">Manage manual hostel expenditures (maintenance, bills, etc.).</p>
        </div>
        <div className="bg-white px-6 py-4 rounded-3xl shadow-sm border border-rose-100 text-right">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Manual Expenses</p>
          <p className="text-3xl font-black text-rose-500">₹{totalExpenses.toLocaleString('en-IN')}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 relative z-10">
        
        {/* LEFT COLUMN: The Add/Edit Form */}
        <div className="xl:col-span-1">
          <div className="bg-white p-8 rounded-3xl shadow-lg shadow-slate-200/50 border border-slate-100 sticky top-10">
            <h3 className="text-xl font-black text-slate-800 border-b border-slate-100 pb-4 mb-6">
              {editRecord ? '✏️ Edit Expense' : '➕ Add New Expense'}
            </h3>
            
            <form action={editRecord ? updateExpense : addExpense} className="flex flex-col gap-5">
              {/* Hidden ID field strictly for updating */}
              {editRecord && <input type="hidden" name="id" value={editRecord.id} />}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Description / Title</label>
                <input type="text" name="title" defaultValue={editRecord?.title || ''} required placeholder="e.g. Water Tank Repair" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-2 focus:ring-rose-500 focus:bg-white outline-none transition-all" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Category</label>
                <select name="category" defaultValue={editRecord?.category || 'Maintenance'} required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-2 focus:ring-rose-500 focus:bg-white outline-none transition-all">
                  <option value="Maintenance">🔧 Maintenance & Repairs</option>
                  <option value="Utilities">💡 Utilities (Electricity, Water, Wi-Fi)</option>
                  <option value="Groceries">🥕 Mess Groceries (Ad-hoc)</option>
                  <option value="Other">📝 Other</option>
                </select>
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Amount (₹)</label>
                  <input type="number" name="amount" defaultValue={editRecord?.amount || ''} required placeholder="1500" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-2 focus:ring-rose-500 focus:bg-white outline-none transition-all" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Date</label>
                  {/* We slice to get YYYY-MM-DD format for the HTML date picker */}
                  <input type="date" name="expense_date" defaultValue={editRecord?.expense_date ? new Date(editRecord.expense_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)} required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-2 focus:ring-rose-500 focus:bg-white outline-none transition-all" />
                </div>
              </div>

              <div className="mt-4 flex gap-3">
                <button type="submit" className="flex-1 bg-slate-800 text-white font-bold py-4 rounded-xl hover:bg-slate-900 transition-colors shadow-md">
                  {editRecord ? 'Save Changes' : 'Record Expense'}
                </button>
                {editRecord && (
                  <Link href="/expenses" className="flex-1 bg-slate-100 text-slate-600 font-bold py-4 rounded-xl hover:bg-slate-200 transition-colors text-center flex items-center justify-center">
                    Cancel
                  </Link>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: The Data Table */}
        <div className="xl:col-span-2">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-lg font-black text-slate-800">Expense History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-white text-slate-400 text-xs uppercase tracking-widest border-b border-slate-100">
                  <tr>
                    <th className="p-6">Date & Category</th>
                    <th className="p-6">Description</th>
                    <th className="p-6 text-right">Amount</th>
                    <th className="p-6 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm bg-white">
                  {expenses?.map((exp: any) => (
                    <tr key={exp.id} className={`hover:bg-slate-50 transition-colors ${editId === exp.id.toString() ? 'bg-rose-50/50' : ''}`}>
                      <td className="p-6">
                        <p className="font-bold text-slate-900">{new Date(exp.expense_date).toLocaleDateString('en-IN')}</p>
                        <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-bold">{exp.category}</p>
                      </td>
                      <td className="p-6 font-medium text-slate-700">
                        {exp.title}
                      </td>
                      <td className="p-6 text-right font-black text-rose-500 text-lg">
                        ₹{Number(exp.amount).toLocaleString('en-IN')}
                      </td>
                      <td className="p-6">
                        <div className="flex justify-center items-center gap-3">
                          {/* The EDIT Button (Uses URL routing) */}
                          <Link href={`/expenses?edit=${exp.id}`} className="text-indigo-500 hover:text-indigo-700 font-bold text-xs uppercase tracking-wider bg-indigo-50 px-3 py-2 rounded-lg transition-colors">
                            Edit
                          </Link>
                          
                          {/* The DELETE Button */}
                          <form action={deleteExpense}>
                            <input type="hidden" name="id" value={exp.id} />
                            <button type="submit" className="text-rose-500 hover:text-rose-700 font-bold text-xs uppercase tracking-wider bg-rose-50 px-3 py-2 rounded-lg transition-colors">
                              Delete
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {(!expenses || expenses.length === 0) && (
                    <tr>
                      <td colSpan={4} className="p-12 text-center">
                        <p className="text-slate-400 italic font-medium">No expenses recorded yet. Your ledger is clean!</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
