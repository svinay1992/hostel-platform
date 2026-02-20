import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function StudentPortal() {
  
  // 1. DYNAMIC MAGIC: Read the badge from the browser
  const cookieStore = await cookies();
  const studentToken = cookieStore.get('hmp_student_token');

  if (!studentToken) {
    redirect('/portal-login');
  }

  const myStudentId = parseInt(studentToken.value); 

  // 2. Fetch Student's Profile and Room details
  const { data: profileData } = await supabase
    .from('students')
    .select('phone_number, users(name, email), beds(bed_number, rooms(room_number))')
    .eq('id', myStudentId)
    .single();

  const profile: any = profileData;
  const studentName = profile?.users?.name || (profile?.users?.[0]?.name) || 'Unknown Student';
  const roomNumber = profile?.beds?.rooms?.room_number || (profile?.beds?.rooms?.[0]?.room_number) || (profile?.beds?.[0]?.rooms?.room_number) || 'N/A';
  const bedNumber = profile?.beds?.bed_number || (profile?.beds?.[0]?.bed_number) || 'N/A';

  // 3. Fetch Student's Rent Invoices
  const { data: myInvoices } = await supabase
    .from('invoices')
    .select('*')
    .eq('student_id', myStudentId)
    .order('invoice_date', { ascending: false });

  // 4. Fetch the Mess Menu
  const todayMenuDay = 'Wednesday'; 
  const { data: todaysMenu } = await supabase
    .from('mess_menu')
    .select('*')
    .eq('day_of_week', todayMenuDay)
    .single();

  // 5. NEW: Fetch the latest Announcements (Limit to top 3)
  const { data: notices } = await supabase
    .from('notices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);

  // 6. SERVER ACTION: Submit a Maintenance Complaint
  async function submitComplaint(formData: FormData) {
    'use server';
    const issueType = formData.get('issue_type') as string;
    const description = formData.get('description') as string;

    await supabase.from('complaints').insert([{
      student_id: myStudentId, 
      issue_type: issueType,
      description: description,
      status: 'Open'
    }]);

    revalidatePath('/portal');
  }

  // 7. SERVER ACTION: Securely Log Out
  async function handleLogout() {
    'use server';
    const cookieStore = await cookies();
    cookieStore.delete('hmp_student_token'); 
    redirect('/portal-login'); 
  }

  return (
    <div className="absolute inset-0 z-50 bg-gray-50 flex flex-col font-sans overflow-y-auto">
      
      {/* PORTAL HEADER */}
      <header className="bg-indigo-600 text-white p-6 shadow-md">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">HMP Student Portal</h1>
            <p className="text-indigo-200 text-sm mt-1">Welcome back, {studentName}</p>
          </div>
          
          <div className="text-right flex items-center gap-4">
            <span className="bg-indigo-800 px-3 py-1 rounded-full text-sm font-bold shadow-inner hidden md:inline-block">
              Room {roomNumber} • Bed {bedNumber}
            </span>
            
            <form action={handleLogout}>
              <button type="submit" className="text-sm bg-white/10 hover:bg-white/20 text-white font-bold py-1 px-3 rounded transition-colors border border-white/20">
                Log Out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* PORTAL CONTENT */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Notices, Rent & Food */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* THE NEW NOTICE BOARD */}
          {notices && notices.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-yellow-50 flex items-center gap-2">
                <span className="text-xl">📢</span>
                <h3 className="text-lg font-bold text-gray-800">Notice Board</h3>
              </div>
              <div className="p-5 flex flex-col gap-4">
                {notices.map((notice: any) => (
                  <div key={notice.id} className={`p-4 rounded-xl border-l-4 ${notice.is_urgent ? 'bg-red-50 border-red-500' : 'bg-gray-50 border-indigo-500'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <h4 className={`font-bold text-lg ${notice.is_urgent ? 'text-red-800' : 'text-gray-900'}`}>{notice.title}</h4>
                      {notice.is_urgent && (
                        <span className="bg-red-200 text-red-800 text-[10px] uppercase font-extrabold px-2 py-1 rounded">Urgent</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{notice.message}</p>
                    <p className="text-xs text-gray-400 mt-3 font-medium">Posted: {new Date(notice.created_at).toLocaleDateString('en-IN')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MY RENT SECTION */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">My Rent Invoices</h3>
            </div>
            <div className="p-0 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Due Date</th>
                    <th className="p-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {myInvoices?.map((invoice: any) => (
                    <tr key={invoice.id}>
                      <td className="p-4 font-bold text-gray-700">₹{Number(invoice.amount).toLocaleString('en-IN')}</td>
                      <td className="p-4 text-gray-500">{new Date(invoice.due_date).toLocaleDateString('en-IN')}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          invoice.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>{invoice.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* TODAY'S MESS MENU */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">Today's Menu ({todayMenuDay})</h3>
            </div>
            <div className="p-5 grid grid-cols-3 gap-4 text-center">
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                <p className="text-xs font-bold text-orange-400 uppercase mb-2">Breakfast</p>
                <p className="text-sm font-semibold text-gray-800">{todaysMenu?.breakfast || 'Not set'}</p>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <p className="text-xs font-bold text-blue-400 uppercase mb-2">Lunch</p>
                <p className="text-sm font-semibold text-gray-800">{todaysMenu?.lunch || 'Not set'}</p>
              </div>
              <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                <p className="text-xs font-bold text-indigo-400 uppercase mb-2">Dinner</p>
                <p className="text-sm font-semibold text-gray-800">{todaysMenu?.dinner || 'Not set'}</p>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Helpdesk Form */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Report an Issue</h3>
            <p className="text-sm text-gray-500 mb-4">Is something broken in your room? Let the admin know.</p>
            
            <form action={submitComplaint} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Issue Type</label>
                <select name="issue_type" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="Electrical">⚡ Electrical (Fan, Light, AC)</option>
                  <option value="Plumbing">🚰 Plumbing (Tap, Washroom)</option>
                  <option value="Carpentry">🚪 Carpentry (Bed, Door, Wardrobe)</option>
                  <option value="Other">❓ Other</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Description</label>
                <textarea 
                  name="description" 
                  rows={4} 
                  required 
                  placeholder="Please describe the problem exactly..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 resize-none"
                ></textarea>
              </div>

              <button type="submit" className="w-full bg-orange-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-orange-600 transition-colors shadow-sm">
                Submit Ticket
              </button>
            </form>
          </div>
        </div>

      </main>
    </div>
  );
}