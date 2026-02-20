import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';

export default async function ExpensesPage() {
  
  // 1. Fetch all expenses from the database
  const { data: expenses } = await supabase
    .from('expenses')
    .select('*')
    .order('expense_date', { ascending: false });

  // Calculate the total expenses for the summary card
  const totalExpenses = expenses?.reduce((sum: number, exp: any) => sum + Number(exp.amount), 0) || 0;

  // 2. SERVER ACTION: Record a new expense
  async function recordExpense(formData: FormData) {
    'use server';
    const category = formData.get('category') as string;
    const amount = formData.get('amount') as string;
    const description = formData.get('description') as string;
    const expense_date = formData.get('expense_date') as string;

    await supabase.from('expenses').insert([{
      category,
      amount: parseFloat(amount),
      description,
      expense_date
    }]);

    revalidatePath('/expenses');
  }

  // SERVER ACTION: Delete a mistake
  async function deleteExpense(formData: FormData) {
    'use server';
    const id = formData.get('id') as string;
    await supabase.from('expenses').delete().eq('id', id);
    revalidatePath('/expenses');
  }

  return (
    <main className="flex-1 p-10 overflow-y-auto bg-gray-50 h-full font-sans">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">📉 Expense Ledger</h2>
          <p className="text-gray-500 mt-1">Track operational costs and hostel outflows.</p>
        </div>
        <div className="bg-white px-6 py-4 rounded-xl shadow-sm border border-red-100 text-right">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Outflow</p>
          <p className="text-2xl font-extrabold text-red-600">₹{totalExpenses.toLocaleString('en-IN')}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: The Expense Entry Form */}
        <div className="xl:col-span-1">
          <form action={recordExpense} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-5 sticky top-10">
            <h3 className="text-xl font-bold text-gray-800 border-b border-gray-100 pb-3">Record New Expense</h3>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Date</label>
              <input type="date" name="expense_date" required className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-red-500 outline-none" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Category</label>
              <select name="category" required className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-red-500 outline-none bg-white">
                <option value="Electricity & Utilities">⚡ Electricity & Utilities</option>
                <option value="Staff Salary">👨‍🍳 Staff Salary</option>
                <option value="Mess Groceries">🥕 Mess Groceries</option>
                <option value="Maintenance & Repair">🛠️ Maintenance & Repair</option>
                <option value="Other">📝 Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Amount (₹)</label>
              <input type="number" name="amount" required placeholder="0.00" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-red-500 outline-none" />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Description / Memo</label>
              <input type="text" name="description" required placeholder="e.g. Plumber for Room 102" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-red-500 outline-none" />
            </div>

            <button type="submit" className="mt-2 w-full bg-red-600 text-white font-bold py-3 rounded-lg hover:bg-red-700 transition-colors shadow-sm">
              Add to Ledger
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: The Ledger Table */}
        <div className="xl:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="p-5">Date</th>
                    <th className="p-5">Category</th>
                    <th className="p-5">Description</th>
                    <th className="p-5">Amount</th>
                    <th className="p-5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm">
                  {expenses?.map((expense: any) => (
                    <tr key={expense.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="p-5 text-gray-600 font-medium whitespace-nowrap">
                        {new Date(expense.expense_date).toLocaleDateString('en-IN')}
                      </td>
                      <td className="p-5 font-bold text-gray-800">
                        {expense.category}
                      </td>
                      <td className="p-5 text-gray-600">
                        {expense.description}
                      </td>
                      <td className="p-5 font-extrabold text-red-600 whitespace-nowrap">
                        ₹{Number(expense.amount).toLocaleString('en-IN')}
                      </td>
                      <td className="p-5 text-center">
                        <form action={deleteExpense}>
                          <input type="hidden" name="id" value={expense.id} />
                          <button type="submit" className="text-gray-400 hover:text-red-600 transition-colors" title="Delete Entry">
                            🗑️
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}

                  {(!expenses || expenses.length === 0) && (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-gray-400 italic">
                        No expenses recorded yet. Books are perfectly clean!
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