import { supabase } from '../lib/supabase';
import Link from 'next/link';

export default async function MasterDashboard() {
  
  // 1. FETCH OCCUPANCY STATS
  const { count: studentCount } = await supabase.from('students').select('*', { count: 'exact', head: true });
  const { count: totalBeds } = await supabase.from('beds').select('*', { count: 'exact', head: true });
  const { count: occupiedBeds } = await supabase.from('beds').select('*', { count: 'exact', head: true }).eq('is_occupied', true);
  const availableBeds = (totalBeds || 0) - (occupiedBeds || 0);
  const occupancyRate = totalBeds ? Math.round(((occupiedBeds || 0) / totalBeds) * 100) : 0;

  // 2. FETCH HELPDESK STATS
  const { count: openComplaints } = await supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'Open');

  // 3. FETCH FINANCIAL STATS (Income vs Expenses)
  const { data: paidInvoices } = await supabase.from('invoices').select('amount').eq('status', 'Paid');
  const totalIncome = paidInvoices?.reduce((sum, inv) => sum + Number(inv.amount), 0) || 0;

  const { data: pendingInvoices } = await supabase.from('invoices').select('amount').eq('status', 'Pending');
  const pendingDues = pendingInvoices?.reduce((sum, inv) => sum + Number(inv.amount), 0) || 0;

  const { data: expenses } = await supabase.from('expenses').select('amount');
  const totalExpenses = expenses?.reduce((sum, exp) => sum + Number(exp.amount), 0) || 0;

  const netProfit = totalIncome - totalExpenses;

  return (
    <main className="flex-1 p-10 overflow-y-auto bg-gray-50 h-full font-sans">
      <header className="mb-10">
        <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Master Dashboard</h2>
        <p className="text-gray-500 mt-1">Real-time overview of your hostel operations.</p>
      </header>

      {/* TOP ROW: Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Total Students</h3>
            <span className="text-2xl">🎓</span>
          </div>
          <div className="flex items-end justify-between">
            <p className="text-4xl font-extrabold text-gray-800">{studentCount || 0}</p>
            <Link href="/students" className="text-indigo-600 text-sm font-bold hover:underline">View All &rarr;</Link>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Available Beds</h3>
            <span className="text-2xl">🛏️</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-extrabold text-indigo-600">{availableBeds}</p>
              <p className="text-xs text-gray-400 mt-1 font-medium">{occupancyRate}% Occupied</p>
            </div>
            <Link href="/rooms" className="text-indigo-600 text-sm font-bold hover:underline">Manage &rarr;</Link>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Pending Dues</h3>
            <span className="text-2xl">⚠️</span>
          </div>
          <div className="flex items-end justify-between">
            <p className="text-3xl font-extrabold text-orange-500">₹{pendingDues.toLocaleString('en-IN')}</p>
            <Link href="/finance" className="text-indigo-600 text-sm font-bold hover:underline">Collect &rarr;</Link>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Open Tickets</h3>
            <span className="text-2xl">🛠️</span>
          </div>
          <div className="flex items-end justify-between">
            <p className={`text-4xl font-extrabold ${openComplaints && openComplaints > 0 ? 'text-red-500' : 'text-green-500'}`}>
              {openComplaints || 0}
            </p>
            <Link href="/helpdesk" className="text-indigo-600 text-sm font-bold hover:underline">Resolve &rarr;</Link>
          </div>
        </div>

      </div>

      {/* MIDDLE ROW: Financial Health */}
      <h3 className="text-xl font-bold text-gray-800 mb-4">Financial Health</h3>
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 grid grid-cols-1 md:grid-cols-3 gap-8 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        
        <div className="flex flex-col items-center justify-center pt-4 md:pt-0">
          <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Total Income (Rent)</p>
          <p className="text-4xl font-extrabold text-green-500">₹{totalIncome.toLocaleString('en-IN')}</p>
        </div>

        <div className="flex flex-col items-center justify-center pt-8 md:pt-0">
          <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Total Expenses</p>
          <p className="text-4xl font-extrabold text-red-500">₹{totalExpenses.toLocaleString('en-IN')}</p>
        </div>

        <div className="flex flex-col items-center justify-center pt-8 md:pt-0">
          <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Net Profit</p>
          <p className={`text-5xl font-black ${netProfit >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
            ₹{netProfit.toLocaleString('en-IN')}
          </p>
        </div>

      </div>

    </main>
  );
}