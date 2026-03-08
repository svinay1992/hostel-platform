// Cache buster
export const dynamic = 'force-dynamic';

import { supabase } from '../../lib/supabase';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import AutoRefresh from '../_components/auto-refresh';

export default async function StudentPortalDashboard() {
  
  // 1. Read the secure cookie
  const cookieStore = await cookies();
  const studentIdString = cookieStore.get('hmp_student_token')?.value;

  if (!studentIdString) {
    redirect('/portal-login');
  }

  const studentId = studentIdString;

  // 2. Fetch student profile
  const { data: student } = await supabase
    .from('student_admissions')
    .select('*')
    .eq('id', studentId)
    .eq('status', 'ACTIVE')
    .single();

  if (!student) {
    redirect('/portal-login');
  }

  // Data Fetching
  const { data: myInvoices } = await supabase
    .from('invoices')
    .select('*')
    .eq('student_id', studentId)
    .order('due_date', { ascending: false });

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayMenuDay = days[new Date().getDay()]; 
  
  const { data: todaysMenu } = await supabase
    .from('mess_menu')
    .select('*')
    .eq('day_of_week', todayMenuDay)
    .single();

  const { data: notices } = await supabase
    .from('notices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  // Actions
  async function handleLogout() {
    'use server';
    const cookieStore = await cookies();
    cookieStore.delete('hmp_student_token');
    redirect('/portal-login');
  }

  async function submitComplaint(formData: FormData) {
    'use server';
    const issueType = (formData.get('issue_type') as string)?.trim();
    const description = (formData.get('description') as string)?.trim();
    const normalizedEmail = (student.email || '').trim().toLowerCase();
    const phoneDigits = (student.phone || '').toString().replace(/\D+/g, '');

    if (!issueType || !description || !normalizedEmail) return;
    
    const { data: existingPortalUsers } = await supabase
      .from('users')
      .select('id')
      .ilike('email', normalizedEmail)
      .order('id', { ascending: false })
      .limit(1);

    let portalUserId: number | null = existingPortalUsers?.[0]?.id || null;

    if (!portalUserId) {
      const { data: newPortalUser, error: createPortalUserError } = await supabase
        .from('users')
        .insert([{
          name: student.full_name || 'Student',
          email: normalizedEmail,
          role: 'student',
          password: phoneDigits || '0000000000',
        }])
        .select('id')
        .single();

      if (createPortalUserError) {
        console.error('COMPLAINT USER CREATE ERROR:', createPortalUserError.message);
        return;
      }

      portalUserId = newPortalUser?.id || null;
    }

    let legacyStudentId: number | null = null;

    if (portalUserId) {
      const { data: existingLegacyStudent } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', portalUserId)
        .maybeSingle();

      if (existingLegacyStudent?.id) {
        legacyStudentId = existingLegacyStudent.id;
      } else {
        // Keep complaints compatibility by ensuring the legacy student record exists.
        const { data: createdLegacyStudent, error: legacyInsertError } = await supabase
          .from('students')
          .insert([{
            user_id: portalUserId,
            phone_number: phoneDigits || student.phone || null,
            bed_id: student.bed_id || null,
            security_deposit: student.security_deposit || 0,
          }])
          .select('id')
          .single();

        if (legacyInsertError) {
          console.error('COMPLAINT LEGACY STUDENT SYNC ERROR:', legacyInsertError.message);
        } else {
          legacyStudentId = createdLegacyStudent?.id || null;
        }
      }
    }

    if (!legacyStudentId && phoneDigits) {
      const { data: fallbackLegacyStudent } = await supabase
        .from('students')
        .select('id')
        .ilike('phone_number', `%${phoneDigits}%`)
        .order('id', { ascending: false })
        .limit(1);

      legacyStudentId = fallbackLegacyStudent?.[0]?.id || null;
    }

    if (legacyStudentId) {
      const { error: complaintError } = await supabase.from('complaints').insert([{
        student_id: legacyStudentId,
        issue_type: issueType,
        description,
        status: 'Open'
      }]);

      if (complaintError) {
        console.error('COMPLAINT INSERT ERROR:', complaintError.message);
      }
    } else {
      console.error('COMPLAINT LINK ERROR: No legacy student mapping found for', normalizedEmail);
    }

    revalidatePath('/portal');
    revalidatePath('/helpdesk');
    revalidatePath('/');
  }

  return (
    <div className="fixed top-0 left-0 w-full h-full z-[9999] bg-[#F1F5F9] font-sans flex flex-col overflow-y-auto m-0 text-slate-900">
      <AutoRefresh intervalMs={4000} />
      
      {/* Subtle modern background gradient */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(45%_40%_at_50%_50%,rgba(99,102,241,0.05)_0%,transparent_100%)]"></div>

      {/* TOP NAVIGATION */}
      <nav className="sticky top-0 w-full bg-white/90 backdrop-blur-xl border-b border-slate-200 z-50">
        <div className="max-w-7xl mx-auto px-6 h-18 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <span className="text-white text-xl">🏠</span>
            </div>
            <div>
              <h1 className="font-bold text-slate-900 text-lg leading-none">Student Hub</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Management Portal</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-bold text-slate-700">{student.full_name}</p>
              <p className="text-[10px] font-medium text-emerald-600 uppercase">● Resident Active</p>
            </div>
            <form action={handleLogout}>
              <button type="submit" className="group flex items-center gap-2 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-bold text-xs uppercase px-4 py-2.5 rounded-full transition-all border border-slate-200 hover:border-rose-100">
                <span>Sign Out</span>
                <span className="group-hover:translate-x-0.5 transition-transform">→</span>
              </button>
            </form>
          </div>
        </div>
      </nav>

      <main className="flex-1 p-6 lg:p-10 max-w-7xl mx-auto w-full">
        
        {/* HEADER SECTION */}
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Dashboard</h2>
            <p className="text-slate-500 mt-1 font-medium italic">Welcome back to your residence overview.</p>
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100">
            <span className="text-indigo-500">📅</span>
            <span className="text-sm font-bold text-slate-600">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </div>
        </header>

        {/* STATS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          
          {/* ROOM CARD */}
          <div className="bg-white p-7 rounded-[2rem] shadow-sm border border-slate-200/60 hover:border-indigo-200 transition-colors relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <span className="text-6xl italic font-black">01</span>
             </div>
             <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-4">Current Residence</p>
             <div className="flex items-baseline gap-2">
                <h3 className="text-4xl font-black text-slate-900">Room {student.room_number || 'TBA'}</h3>
                <span className="text-slate-400 font-bold text-sm">/ Bed {student.bed_number || 'N/A'}</span>
             </div>
             <div className="mt-6 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Allocated & Active</p>
             </div>
          </div>

          {/* FINANCIAL SUMMARY */}
          <div className="bg-white p-7 rounded-[2rem] shadow-sm border border-slate-200/60 hover:border-emerald-200 transition-colors group">
             <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-4">Total Paid (Admission)</p>
             <h3 className="text-4xl font-black text-slate-900">₹{student.total_paid || 0}</h3>
             <div className="mt-4 flex gap-4">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Deposit: <span className="text-slate-700">₹{student.security_deposit}</span></div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Advance: <span className="text-slate-700">₹{student.advance_rent}</span></div>
             </div>
          </div>

          {/* PROFILE PREVIEW */}
          <div className="bg-slate-900 p-7 rounded-[2rem] shadow-xl text-white relative overflow-hidden">
             <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl"></div>
             <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-4">Verified Profile</p>
             <p className="text-xl font-bold truncate">{student.full_name}</p>
             <p className="text-xs text-slate-400 mt-1">{student.email}</p>
             <div className="mt-6 pt-4 border-t border-slate-800">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Academic Info</p>
                <p className="text-xs font-medium mt-1 text-slate-300">{student.coaching_name || 'Personal Study'}</p>
             </div>
          </div>
        </div>

        {/* MIDDLE SECTION: INVOICES & MENU */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
          
          {/* INVOICES - 8 COLS */}
          <div className="lg:col-span-8 space-y-8">
            <div className="bg-white rounded-[2rem] border border-slate-200/60 shadow-sm overflow-hidden">
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-black text-slate-900">Payment History</h3>
                <span className="text-xs font-bold text-slate-400">{myInvoices?.length || 0} Records</span>
              </div>
              <div className="p-2 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="px-6 py-4 text-left">Bill Details</th>
                      <th className="px-6 py-4 text-left">Due Date</th>
                      <th className="px-6 py-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {myInvoices?.map((inv: any) => (
                      <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-5">
                          <p className="text-lg font-black text-slate-800">₹{Number(inv.amount).toLocaleString('en-IN')}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Monthly Rent</p>
                        </td>
                        <td className="px-6 py-5">
                          <p className="text-sm font-bold text-slate-600">
                            {new Date(inv.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <span className={`inline-flex px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {(!myInvoices || myInvoices.length === 0) && (
                      <tr><td colSpan={3} className="px-6 py-12 text-center text-slate-400 font-medium italic text-sm">No billing data found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* MESS MENU */}
            <div className="bg-white rounded-[2rem] border border-slate-200/60 shadow-sm overflow-hidden">
              <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">🍲 Today's Menu</h3>
                <div className="flex items-center gap-2 px-3 py-1 bg-white border border-slate-200 rounded-lg shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{todayMenuDay}</span>
                </div>
              </div>
              <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                 {[
                   { label: 'Breakfast', val: todaysMenu?.breakfast, color: 'amber' },
                   { label: 'Lunch', val: todaysMenu?.lunch, color: 'sky' },
                   { label: 'Dinner', val: todaysMenu?.dinner, color: 'indigo' }
                 ].map((item) => (
                   <div key={item.label} className="relative p-6 rounded-2xl bg-slate-50 border border-slate-100 group hover:border-indigo-100 transition-colors">
                      <p className={`text-[10px] font-black text-${item.color}-500 uppercase tracking-widest mb-3`}>{item.label}</p>
                      <p className="text-sm font-bold text-slate-700 leading-relaxed min-h-[3rem]">{item.val || 'Not Updated'}</p>
                   </div>
                 ))}
              </div>
            </div>
          </div>

          {/* SIDEBAR: COMPLAINTS & ANNOUNCEMENTS - 4 COLS */}
          <div className="lg:col-span-4 space-y-8">
            
            {/* COMPLAINT FORM */}
            <div className="bg-white rounded-[2rem] border border-slate-200/60 shadow-lg shadow-slate-200/40 p-8">
              <div className="mb-8">
                <h3 className="text-xl font-black text-slate-900">Helpdesk</h3>
                <p className="text-xs text-slate-400 font-medium mt-1">Quickly report maintenance issues.</p>
              </div>
              
              <form action={submitComplaint} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Issue Category</label>
                  <select name="issue_type" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                    <option value="Electrical">⚡ Electrical</option>
                    <option value="Plumbing">🚰 Plumbing</option>
                    <option value="Carpentry">🚪 Carpentry</option>
                    <option value="Other">❓ Other</option>
                  </select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Describe Issue</label>
                  <textarea name="description" rows={4} required placeholder="Example: Fan in Room 102 is making noise..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"></textarea>
                </div>

                <button type="submit" className="w-full py-4 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-xl shadow-slate-200 active:scale-[0.98]">
                  Submit Support Ticket
                </button>
              </form>
            </div>

            {/* ANNOUNCEMENTS */}
            <div className="bg-white rounded-[2rem] border border-slate-200/60 shadow-sm p-8">
               <h3 className="text-lg font-black text-slate-900 mb-6">Recent Notices</h3>
               <div className="space-y-5">
                  {notices?.map((notice: any) => (
                    <div key={notice.id} className={`group relative pl-4 border-l-2 ${notice.is_urgent ? 'border-rose-500' : 'border-indigo-500'}`}>
                       <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${notice.is_urgent ? 'text-rose-500' : 'text-indigo-500'}`}>
                         {notice.is_urgent ? 'Critical Notice' : 'Information'}
                       </p>
                       <p className="text-sm font-bold text-slate-800 leading-snug group-hover:text-indigo-600 transition-colors">{notice.title}</p>
                       <p className="text-xs text-slate-400 mt-2">
                         {new Date(notice.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                       </p>
                    </div>
                  ))}
                  {(!notices || notices.length === 0) && (
                    <p className="text-sm text-slate-400 italic">No announcements found.</p>
                  )}
               </div>
            </div>

          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="w-full py-10 px-6 border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">© 2026 Hostel Management Platform</p>
          <div className="flex gap-6">
            <span className="text-xs font-bold text-slate-400 cursor-pointer hover:text-indigo-500 transition-colors uppercase tracking-widest">Support</span>
            <span className="text-xs font-bold text-slate-400 cursor-pointer hover:text-indigo-500 transition-colors uppercase tracking-widest">Privacy</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
// hello 
