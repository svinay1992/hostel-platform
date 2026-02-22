// Cache buster
export const dynamic = 'force-dynamic';

import { supabase } from '../../lib/supabase';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache'; // <-- Added for the complaint form to refresh the page

export default async function StudentPortalDashboard() {
  
  // 1. Read the secure cookie
  const cookieStore = await cookies();
  const studentIdString = cookieStore.get('hmp_student_token')?.value;

  // If no cookie, force them back to login
  if (!studentIdString) {
    redirect('/portal-login');
  }

  const studentId = studentIdString;

  // 2. Fetch the logged-in student's full profile
  const { data: student } = await supabase
    .from('student_admissions')
    .select('*')
    .eq('id', studentId)
    .eq('status', 'ACTIVE')
    .single();

  // If student is somehow deleted, force logout
  if (!student) {
    redirect('/portal-login');
  }

  // ==========================================
  // ADDED: FETCH INVOICES & MESS MENU
  // ==========================================
  
  // Fetch Student Invoices
  const { data: myInvoices } = await supabase
    .from('invoices')
    .select('*')
    .eq('student_id', studentId)
    .order('due_date', { ascending: false });

  // Fetch Today's Mess Menu dynamically
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayMenuDay = days[new Date().getDay()]; 
  
  const { data: todaysMenu } = await supabase
    .from('mess_menu')
    .select('*')
    .eq('day_of_week', todayMenuDay)
    .single();

  // ==========================================
  // ACTIONS
  // ==========================================

  // SERVER ACTION: Handle Logout inline
  async function handleLogout() {
    'use server';
    const cookieStore = await cookies();
    cookieStore.delete('hmp_student_token');
    redirect('/portal-login');
  }

  // ADDED SERVER ACTION: Submit a Maintenance Complaint
  async function submitComplaint(formData: FormData) {
    'use server';
    const issueType = formData.get('issue_type') as string;
    const description = formData.get('description') as string;

    await supabase.from('complaints').insert([{
      student_id: studentId,
      issue_type: issueType,
      description: description,
      status: 'Open'
    }]);

    revalidatePath('/portal');
  }

  return (
    // FULL SCREEN OVERRIDE: Covers the entire browser window to hide the Admin Sidebar
    <div className="fixed top-0 left-0 w-[100vw] h-[100vh] z-[9999] bg-[#F8FAFC] font-sans flex flex-col overflow-y-auto m-0">
      
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-96 overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-200/40 rounded-full blur-3xl mix-blend-multiply opacity-70"></div>
        <div className="absolute top-10 right-20 w-80 h-80 bg-emerald-200/40 rounded-full blur-3xl mix-blend-multiply opacity-70"></div>
      </div>

      {/* TOP NAVIGATION BAR */}
      <nav className="w-full bg-white/80 backdrop-blur-md border-b border-slate-200 p-4 px-8 flex justify-between items-center relative z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center text-xl shadow-md">🎓</div>
          <div>
            <h1 className="font-black text-slate-800 tracking-tight text-lg leading-tight">My Hostel</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Student Portal</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <p className="text-sm font-bold text-slate-700 hidden md:block">Hello, {student.full_name.split(' ')[0]} 👋</p>
          <form action={handleLogout}>
            <button type="submit" className="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs uppercase tracking-wider px-4 py-2 rounded-lg transition-colors border border-rose-100">
              Log Out
            </button>
          </form>
        </div>
      </nav>

      {/* MAIN DASHBOARD CONTENT */}
      <main className="flex-1 p-8 lg:p-12 max-w-6xl mx-auto w-full relative z-10">
        
        <header className="mb-10">
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Welcome back, {student.full_name}!</h2>
          <p className="text-slate-500 mt-2 font-medium">Here is your current hostel status and information.</p>
        </header>

        {/* YOUR EXACT ROW 1: QUICK STATS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          
          {/* CARD 1: MY ROOM */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-50 rounded-full blur-2xl z-0"></div>
            <div className="relative z-10 mb-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                <span>🛏️</span> Room Allocation
              </h3>
              <p className="text-3xl font-black text-indigo-600 mt-4">Room {student.room_number || 'TBA'}</p>
              <p className="text-sm font-bold text-slate-600 mt-1">Bed {student.bed_number || 'TBA'}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs font-medium text-slate-500 text-center relative z-10">
              Status: <span className="font-bold text-emerald-600">{student.status}</span>
            </div>
          </div>

          {/* CARD 2: MY INITIAL PAYMENTS */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-50 rounded-full blur-2xl z-0"></div>
            <div className="relative z-10 mb-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                <span>💰</span> Paid at Admission
              </h3>
              <p className="text-3xl font-black text-emerald-600 mt-4">₹{student.total_paid || 0}</p>
              
              <div className="mt-3 space-y-1">
                <p className="text-xs font-medium text-slate-500 flex justify-between">
                  <span>Security Deposit:</span> <strong className="text-slate-700">₹{student.security_deposit || 0}</strong>
                </p>
                <p className="text-xs font-medium text-slate-500 flex justify-between">
                  <span>Advance Rent:</span> <strong className="text-slate-700">₹{student.advance_rent || 0}</strong>
                </p>
              </div>
            </div>
          </div>

          {/* CARD 3: MY PROFILE DETAILS */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-rose-50 rounded-full blur-2xl z-0"></div>
            <div className="relative z-10 mb-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                <span>👤</span> Registered Details
              </h3>
            </div>
            
            <div className="space-y-4 relative z-10">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phone & Email</p>
                <p className="text-sm font-bold text-slate-800">{student.phone}</p>
                <p className="text-xs text-slate-500">{student.email}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Academics</p>
                <p className="text-sm font-bold text-slate-800">{student.coaching_name || 'N/A'}</p>
                <p className="text-xs text-slate-500">{student.course} • {student.timing || 'No timing set'}</p>
              </div>
              <div className="bg-rose-50 p-3 rounded-xl border border-rose-100">
                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-1">Emergency SOS</p>
                <p className="text-sm font-black text-rose-700">{student.parent_name}</p>
                <p className="text-xs font-bold text-rose-600">{student.parent_phone}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================= */}
        {/* ADDED: ROW 2 - INVOICES, MENU, HELPDESK */}
        {/* ========================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT COLUMN: Rent & Food */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            
            {/* MY RENT INVOICES */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="text-lg font-black text-slate-800">My Rent Invoices</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-white text-slate-400 text-xs uppercase tracking-widest border-b border-slate-100">
                    <tr>
                      <th className="p-6">Amount</th>
                      <th className="p-6">Due Date</th>
                      <th className="p-6">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm bg-white">
                    {myInvoices?.map((invoice: any) => (
                      <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-6 font-black text-slate-700 text-lg">₹{Number(invoice.amount).toLocaleString('en-IN')}</td>
                        <td className="p-6 font-medium text-slate-500">{new Date(invoice.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                        <td className="p-6">
                          <span className={`px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider font-black ${
                            invoice.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {invoice.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {(!myInvoices || myInvoices.length === 0) && (
                      <tr><td colSpan={3} className="p-8 text-center text-slate-400 font-medium italic">No invoices generated yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* TODAY'S MESS MENU */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h3 className="text-lg font-black text-slate-800">Today's Menu</h3>
                <span className="bg-indigo-100 text-indigo-700 font-bold px-3 py-1 rounded-lg text-xs uppercase tracking-wider">{todayMenuDay}</span>
              </div>
              <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 shadow-sm relative overflow-hidden">
                  <p className="text-xs font-black text-amber-500 uppercase tracking-widest mb-3">Breakfast</p>
                  <p className="text-sm font-bold text-slate-800 relative z-10">{todaysMenu?.breakfast || 'Menu not updated'}</p>
                </div>
                <div className="bg-sky-50 p-6 rounded-2xl border border-sky-100 shadow-sm relative overflow-hidden">
                  <p className="text-xs font-black text-sky-500 uppercase tracking-widest mb-3">Lunch</p>
                  <p className="text-sm font-bold text-slate-800 relative z-10">{todaysMenu?.lunch || 'Menu not updated'}</p>
                </div>
                <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 shadow-sm relative overflow-hidden">
                  <p className="text-xs font-black text-indigo-500 uppercase tracking-widest mb-3">Dinner</p>
                  <p className="text-sm font-bold text-slate-800 relative z-10">{todaysMenu?.dinner || 'Menu not updated'}</p>
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Helpdesk Form */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 sticky top-28">
              <div className="mb-6 border-b border-slate-100 pb-4">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">🛠️ Report an Issue</h3>
                <p className="text-xs text-slate-500 mt-2 font-medium leading-relaxed">Is something broken in your room? Submit a ticket and the admin will fix it.</p>
              </div>
              
              <form action={submitComplaint} className="flex flex-col gap-5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Issue Type</label>
                  <select name="issue_type" required className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 bg-slate-50 outline-none">
                    <option value="Electrical">⚡ Electrical (Fan, Light, AC)</option>
                    <option value="Plumbing">🚰 Plumbing (Tap, Washroom)</option>
                    <option value="Carpentry">🚪 Carpentry (Bed, Wardrobe)</option>
                    <option value="Other">❓ Other</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Description</label>
                  <textarea 
                    name="description" 
                    rows={5} 
                    required 
                    placeholder="Please describe the problem exactly..."
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 resize-none bg-slate-50 outline-none placeholder-slate-400"
                  ></textarea>
                </div>

                <button type="submit" className="w-full bg-indigo-600 text-white font-black uppercase tracking-wider text-xs py-4 rounded-xl hover:bg-indigo-700 transition-transform hover:-translate-y-1 shadow-lg shadow-indigo-200 mt-2">
                  Submit Ticket
                </button>
              </form>
            </div>
          </div>

        </div>

      </main>

    </div>
  );
}
