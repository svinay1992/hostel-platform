// Cache buster for real-time dashboard updates
export const dynamic = 'force-dynamic';

import { supabase } from '../lib/supabase';
import Link from 'next/link';
import AutoRefresh from './_components/auto-refresh';
import { clearInventoryPurchaseHistory, getInventoryPurchaseHistory } from '../lib/inventory-purchase-cache';
import { clearInventoryUsageHistory } from '../lib/inventory-usage-cache';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { addActivityLog, getActivityLogs } from '../lib/activity-log-cache';

export default async function MasterDashboard({
  searchParams,
}: {
  searchParams: Promise<{ history?: string }>;
}) {
  const resolvedParams = await searchParams;
  const historyStatus = (resolvedParams?.history || '').toLowerCase();

  async function deleteInventoryHistory(formData: FormData) {
    'use server';
    const adminPassword = ((formData.get('admin_password') as string) || '').trim();
    const scope = ((formData.get('scope') as string) || 'both').trim().toLowerCase();

    if (adminPassword !== 'admin123') {
      await addActivityLog({
        module: 'Inventory',
        action: 'History Delete Denied',
        details: 'Inventory history delete was blocked due to failed admin verification',
        actor: 'admin',
        level: 'warning',
      });
      return redirect('/?history=denied');
    }

    if (scope === 'purchases' || scope === 'both') {
      await clearInventoryPurchaseHistory();
    }
    if (scope === 'usage' || scope === 'both') {
      await clearInventoryUsageHistory();
    }
    await addActivityLog({
      module: 'Inventory',
      action: 'History Deleted',
      details: `Inventory history deleted from dashboard with scope: ${scope}`,
      actor: 'admin',
      level: 'critical',
    });

    revalidatePath('/');
    revalidatePath('/inventory');
    redirect('/?history=deleted');
  }
  
  // 1. FETCH OCCUPANCY STATS (Now securely looking at student_admissions)
  const { count: studentCount } = await supabase
    .from('student_admissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ACTIVE'); 

  const { count: totalBeds } = await supabase.from('beds').select('*', { count: 'exact', head: true });
  const { data: activeBedAssignments } = await supabase
    .from('student_admissions')
    .select('bed_id')
    .eq('status', 'ACTIVE')
    .not('bed_id', 'is', null);
  const occupiedBeds = new Set(
    (activeBedAssignments || []).map((row: { bed_id: number | null }) => row.bed_id).filter((bedId): bedId is number => bedId !== null)
  ).size;
  
  const availableBeds = (totalBeds || 0) - (occupiedBeds || 0);
  const occupancyRate = totalBeds ? Math.round(((occupiedBeds || 0) / totalBeds) * 100) : 0;

  // 2. FETCH HELPDESK STATS
  const { count: openComplaints } = await supabase
    .from('complaints')
    .select('*', { count: 'exact', head: true })
    .in('status', ['Open', 'open', 'OPEN']);

  // 3. FETCH FINANCIAL STATS (Income)
  const { data: paidInvoices } = await supabase.from('invoices').select('amount').eq('status', 'Paid');
  const totalIncome = paidInvoices?.reduce((sum, inv) => sum + Number(inv.amount), 0) || 0;

  const { data: pendingInvoices } = await supabase.from('invoices').select('amount').eq('status', 'Pending');
  const pendingDues = pendingInvoices?.reduce((sum, inv) => sum + Number(inv.amount), 0) || 0;

  // 4. FETCH EXPENSES
  const { data: expenses } = await supabase
    .from('expenses')
    .select('amount')
    .neq('category', 'Inventory Purchase');
  const manualExpenses = expenses?.reduce((sum, exp) => sum + Number(exp.amount), 0) || 0;

  const { data: activeStaff } = await supabase.from('staff').select('salary').eq('status', 'Active');
  const totalPayroll = activeStaff?.reduce((sum, staff) => sum + Number(staff.salary), 0) || 0;

  const purchaseHistory = await getInventoryPurchaseHistory();
  const activityLogs = await getActivityLogs(80);
  const activityLogsWithLabel = activityLogs.map((log) => ({
    ...log,
    created_at_label: new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
  }));
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const currentMonthInventoryPurchases = purchaseHistory.reduce((sum, entry) => {
    if ((entry.purchased_at || '').slice(0, 7) !== currentMonthKey) return sum;
    return sum + Number(entry.total_cost || 0);
  }, 0);

  // GRAND TOTALS
  const grandTotalExpenses = manualExpenses + totalPayroll + currentMonthInventoryPurchases;
  const netProfit = totalIncome - grandTotalExpenses;

  return (
    <main className="flex-1 p-8 lg:p-12 overflow-y-auto bg-[#F8FAFC] h-full font-sans relative">
      <AutoRefresh intervalMs={4000} />
      
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-96 overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-200/40 rounded-full blur-3xl mix-blend-multiply opacity-70"></div>
        <div className="absolute top-10 right-20 w-80 h-80 bg-rose-200/40 rounded-full blur-3xl mix-blend-multiply opacity-70"></div>
      </div>

      <header className="mb-12 relative z-10">
        <h2 className="text-4xl font-black text-slate-800 tracking-tight">Master Dashboard</h2>
        <p className="text-slate-500 mt-2 font-medium text-lg">Real-time overview of your hostel operations.</p>
      </header>

      {historyStatus && (
        <div
          className={`mb-6 rounded-xl px-4 py-3 text-sm font-semibold border ${
            historyStatus === 'deleted'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-rose-50 text-rose-700 border-rose-200'
          }`}
        >
          {historyStatus === 'deleted' && 'Inventory history deleted successfully after admin verification.'}
          {historyStatus === 'denied' && 'Admin verification failed. Inventory history was not deleted.'}
        </div>
      )}

      {/* TOP ROW */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12 relative z-10">
        
        {/* CARD 1: Students */}
        <div className="group bg-white p-6 rounded-3xl shadow-sm border border-slate-100/60 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Students</h3>
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl shadow-inner">🎓</div>
            </div>
            <div className="flex items-end justify-between mt-auto">
              <p className="text-5xl font-black text-slate-800 tracking-tighter">{studentCount || 0}</p>
              <Link href="/students" className="text-indigo-600 text-sm font-bold hover:text-indigo-800 transition-colors flex items-center gap-1">View All &rarr;</Link>
            </div>
          </div>
        </div>

        {/* CARD 2: Beds */}
        <div className="group bg-white p-6 rounded-3xl shadow-sm border border-slate-100/60 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Available Beds</h3>
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl shadow-inner">🛏️</div>
            </div>
            <div className="flex items-end justify-between mt-auto">
              <div>
                <p className="text-5xl font-black text-emerald-500 tracking-tighter">{availableBeds}</p>
                <p className="text-xs text-slate-400 mt-1 font-bold bg-slate-100 inline-block px-2 py-1 rounded-md">{occupancyRate}% Occupied</p>
              </div>
              <Link href="/rooms" className="text-emerald-600 text-sm font-bold hover:text-emerald-800 transition-colors flex items-center gap-1">Manage &rarr;</Link>
            </div>
          </div>
        </div>

        {/* CARD 3: Dues */}
        <div className="group bg-white p-6 rounded-3xl shadow-sm border border-slate-100/60 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pending Dues</h3>
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center text-xl shadow-inner">⚠️</div>
            </div>
            <div className="flex items-end justify-between mt-auto">
              <p className="text-4xl font-black text-amber-500 tracking-tighter truncate mr-2">₹{pendingDues.toLocaleString('en-IN')}</p>
              <Link href="/finance" className="text-amber-600 text-sm font-bold hover:text-amber-800 transition-colors flex items-center gap-1">Collect &rarr;</Link>
            </div>
          </div>
        </div>

        {/* CARD 4: Tickets */}
        <div className="group bg-white p-6 rounded-3xl shadow-sm border border-slate-100/60 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Open Tickets</h3>
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center text-xl shadow-inner">🛠️</div>
            </div>
            <div className="flex items-end justify-between mt-auto">
              <p className={`text-5xl font-black tracking-tighter ${openComplaints && openComplaints > 0 ? 'text-rose-500' : 'text-slate-300'}`}>
                {openComplaints || 0}
              </p>
              <Link href="/helpdesk" className="text-rose-600 text-sm font-bold hover:text-rose-800 transition-colors flex items-center gap-1">Resolve &rarr;</Link>
            </div>
          </div>
        </div>

      </div>

      {/* FINANCIAL HEALTH */}
      <div className="relative z-10 group">
        <h3 className="text-lg font-black text-slate-800 mb-5 ml-2 tracking-tight flex items-center gap-2">
          Financial Health <span className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">(Includes Payroll)</span>
        </h3>
        
        <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/30 p-8 lg:p-12 relative overflow-hidden border border-slate-100">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 divide-y md:divide-y-0 md:divide-x divide-slate-100 relative z-10">
            
            <div className="flex flex-col items-center justify-center pt-4 md:pt-0">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Total Income (Rent)</p>
              <p className="text-4xl lg:text-5xl font-black text-emerald-500 tracking-tighter drop-shadow-sm">₹{totalIncome.toLocaleString('en-IN')}</p>
            </div>

            <div className="flex flex-col items-center justify-center pt-8 md:pt-0 relative group/tooltip cursor-help">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1">Total Expenses</p>
              <p className="text-4xl lg:text-5xl font-black text-rose-500 tracking-tighter drop-shadow-sm">₹{grandTotalExpenses.toLocaleString('en-IN')}</p>
              
              <div className="absolute top-full mt-4 bg-slate-900 backdrop-blur-md border border-slate-800 text-white text-xs rounded-xl py-3 px-5 opacity-0 group-hover/tooltip:opacity-100 transition-all duration-300 pointer-events-none z-20 whitespace-nowrap shadow-2xl translate-y-2 group-hover/tooltip:translate-y-0">
                <div className="flex flex-col gap-1">
                  <span className="flex justify-between gap-4"><span className="text-slate-400">Ledger:</span> <strong>₹{manualExpenses.toLocaleString('en-IN')}</strong></span>
                  <span className="flex justify-between gap-4"><span className="text-slate-400">Payroll:</span> <strong>₹{totalPayroll.toLocaleString('en-IN')}</strong></span>
                  <span className="flex justify-between gap-4"><span className="text-slate-400">Inventory (This Month):</span> <strong>₹{currentMonthInventoryPurchases.toLocaleString('en-IN')}</strong></span>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center pt-8 md:pt-0">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Net Profit</p>
              <p className={`text-5xl lg:text-6xl font-black tracking-tighter drop-shadow-lg ${netProfit >= 0 ? 'text-indigo-600' : 'text-rose-500'}`}>₹{netProfit.toLocaleString('en-IN')}</p>
            </div>

          </div>
        </div>
      </div>

      <section className="relative z-10 mt-10">
        <div className="bg-white rounded-3xl shadow-sm border border-red-100 p-6 md:p-8 max-w-2xl">
          <h3 className="text-xl font-black text-slate-800">Delete Inventory History (Admin Verified)</h3>
          <p className="text-slate-500 text-sm mt-1">
            This deletes inventory audit history only. Live stock items remain untouched.
          </p>

          <form action={deleteInventoryHistory} className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Delete Scope</label>
              <select name="scope" defaultValue="both" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 bg-white">
                <option value="both">Purchases + Usage</option>
                <option value="purchases">Only Purchases</option>
                <option value="usage">Only Usage</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Admin Password</label>
              <input
                type="password"
                name="admin_password"
                required
                placeholder="Admin password"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-red-500 outline-none"
              />
            </div>

            <button type="submit" className="w-full bg-red-600 text-white font-bold py-2.5 rounded-lg hover:bg-red-700 transition-colors shadow-sm">
              Verify and Delete
            </button>
          </form>
        </div>
      </section>

      <section className="relative z-10 mt-10">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-800">Live Notice Board (System Activity)</h3>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Auto refresh: every 4s
            </span>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            <ul className="divide-y divide-slate-100">
              {activityLogsWithLabel.length === 0 ? (
                <li className="p-6 text-sm text-slate-400 italic">No activity recorded yet.</li>
              ) : (
                activityLogsWithLabel.map((log) => {
                  const badgeClass =
                    log.level === 'critical'
                      ? 'bg-rose-100 text-rose-700'
                      : log.level === 'warning'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700';

                  return (
                    <li key={log.id} className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-1 rounded-full ${badgeClass}`}>
                          {log.level}
                        </span>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
                          {log.module}
                        </span>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                          {log.actor}
                        </span>
                        <span className="text-xs text-slate-400 ml-auto">
                          {log.created_at_label}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-800 mt-2">{log.action}</p>
                      <p className="text-sm text-slate-600 mt-1">{log.details}</p>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
