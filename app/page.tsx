import { supabase } from '../lib/supabase';

export default async function MasterDashboard() {
  
  // 1. Fetch Total Students
  const { count: studentCount } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true });
  const totalStudents = studentCount || 0;

  // 2. Fetch Pending & Overdue Rent
  const { data: unpaidInvoices } = await supabase
    .from('invoices')
    .select('amount')
    .in('status', ['Pending', 'Overdue']);
  const totalPendingRent = unpaidInvoices?.reduce((sum, invoice) => sum + Number(invoice.amount), 0) || 0;

  // 3. Fetch Occupancy Rate
  const { count: totalBeds } = await supabase.from('beds').select('*', { count: 'exact', head: true });
  const { count: occupiedBeds } = await supabase.from('beds').select('*', { count: 'exact', head: true }).eq('is_occupied', true);
  const occupancyRate = (totalBeds && occupiedBeds) ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  // 4. THE NEW MAGIC: Fetch Open Complaints
  const { count: complaintsCount } = await supabase
    .from('complaints')
    .select('*', { count: 'exact', head: true })
    .in('status', ['Open', 'In Progress']);
  const openComplaints = complaintsCount || 0;

  // 5. Fetch Recent Invoices for the Table
  const { data: recentInvoices } = await supabase
    .from('invoices')
    .select(`
      id, amount, status, invoice_date, payment_method,
      students ( users ( name ) )
    `)
    .order('invoice_date', { ascending: false })
    .limit(5);

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      
   

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-10 overflow-y-auto">
        <header className="mb-8">
          <h2 className="text-3xl font-bold text-gray-800">Welcome back, Admin</h2>
          <p className="text-gray-500 mt-1">Here is the latest overview of your hostel.</p>
        </header>
        
        {/* STATISTICS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-indigo-500">
            <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Total Students</h3>
            <p className="text-4xl font-bold text-gray-800 mt-2">{totalStudents}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-blue-500">
            <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Occupancy Rate</h3>
            <p className="text-4xl font-bold text-blue-600 mt-2">{occupancyRate}%</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-red-500">
            <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Pending Rent</h3>
            <p className="text-4xl font-bold text-red-500 mt-2">₹{totalPendingRent.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-orange-400">
            <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Open Complaints</h3>
            {/* INJECTING LIVE COMPLAINTS HERE */}
            <p className="text-4xl font-bold text-orange-500 mt-2">{openComplaints}</p>
          </div>
        </div>

        {/* RECENT INVOICES TABLE */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-xl font-bold text-gray-800">Recent Rent Payments</h3>
            <a href="/finance" className="text-sm text-indigo-600 font-semibold hover:text-indigo-800">View All →</a>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wider">
                  <th className="p-4 font-semibold">Student Name</th>
                  <th className="p-4 font-semibold">Amount</th>
                  <th className="p-4 font-semibold">Invoice Date</th>
                  <th className="p-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentInvoices?.map((invoice: any) => (
                  <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-medium text-gray-800">
                      {invoice.students?.users?.name || 'Unknown Student'}
                    </td>
                    <td className="p-4 font-semibold text-gray-600">
                      ₹{Number(invoice.amount).toLocaleString('en-IN')}
                    </td>
                    <td className="p-4 text-gray-500">
                      {new Date(invoice.invoice_date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        invoice.status === 'Paid' ? 'bg-green-100 text-green-700' :
                        invoice.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {invoice.status}
                      </span>
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