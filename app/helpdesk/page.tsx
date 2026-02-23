// THE ULTIMATE CACHE BUSTER: Forces Next.js to fetch fresh data every single second
export const dynamic = 'force-dynamic';

import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';

export default async function HelpdeskPage() {
  
  // 1. Fetch complaints safely, ordered by ID to prevent missing column errors!
  const { data: tickets } = await supabase
    .from('complaints')
    .select('*')
    .order('id', { ascending: false });

  // 2. Fetch students safely
  const { data: students } = await supabase
    .from('students')
    .select('id, phone_number, users(name), beds(bed_number, rooms(room_number))');

  // 3. SERVER ACTION: Mark Resolved
  async function resolveTicket(formData: FormData) {
    'use server';
    const ticket_id = formData.get('ticket_id') as string;
    await supabase.from('complaints').update({ status: 'Resolved' }).eq('id', ticket_id);
    revalidatePath('/helpdesk');
    revalidatePath('/'); 
  }

  // 4. SERVER ACTION: Delete Ticket
  async function deleteTicket(formData: FormData) {
    'use server';
    const ticket_id = formData.get('ticket_id') as string;
    await supabase.from('complaints').delete().eq('id', ticket_id);
    revalidatePath('/helpdesk');
    revalidatePath('/');
  }

  const openTickets = tickets?.filter((t: any) => (t.status || '').toString().toLowerCase() === 'open') || [];
  const resolvedTickets = tickets?.filter((t: any) => (t.status || '').toString().toLowerCase() === 'resolved') || [];

  return (
    <main className="flex-1 p-10 overflow-y-auto bg-gray-50 h-full font-sans">
      <header className="mb-10">
        <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">🛠️ Helpdesk & Maintenance</h2>
        <p className="text-gray-500 mt-1">Manage student complaints and facility repairs.</p>
      </header>

      {/* QUICK STATS */}
      <div className="flex gap-4 mb-8">
        <div className="bg-white px-6 py-4 rounded-xl shadow-sm border border-red-100 flex-1">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Action Required</p>
          <p className="text-3xl font-extrabold text-red-500">{openTickets.length} Open</p>
        </div>
        <div className="bg-white px-6 py-4 rounded-xl shadow-sm border border-green-100 flex-1">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Completed</p>
          <p className="text-3xl font-extrabold text-green-500">{resolvedTickets.length} Resolved</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* LEFT COLUMN: ACTIVE TICKETS */}
        <div>
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">🚨 Active Issues</h3>
          <div className="flex flex-col gap-4">
            {openTickets.map((ticket: any) => {
              
              const matchedStudent = students?.find((s: any) => s.id === ticket.student_id);
              
              const userData: any = matchedStudent?.users;
              const bedData: any = matchedStudent?.beds;
              const roomData: any = bedData?.rooms || bedData?.[0]?.rooms;

              const studentName = userData?.name || userData?.[0]?.name || 'Unknown Student';
              const roomNum = roomData?.room_number || roomData?.[0]?.room_number || '?';
              const bedNum = bedData?.bed_number || bedData?.[0]?.bed_number || '?';
              const phone = matchedStudent?.phone_number || '';

              // Safely handle the date just in case 'created_at' doesn't exist
              const dateDisplay = ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('en-IN') : 'Just now';

              return (
                <div key={ticket.id} className="bg-white p-6 rounded-2xl shadow-md border-l-4 border-l-red-500 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <span className="bg-red-100 text-red-700 text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider">
                      {ticket.issue_type}
                    </span>
                    <span className="text-xs font-bold text-gray-400">
                      {dateDisplay}
                    </span>
                  </div>
                  
                  <p className="text-gray-800 font-medium text-sm bg-gray-50 p-3 rounded-lg border border-gray-100">
                    "{ticket.description}"
                  </p>

                  <div className="flex justify-between items-end mt-2">
                    <div>
                      <p className="font-bold text-gray-900">{studentName}</p>
                      <p className="text-xs text-indigo-600 font-bold">Room {roomNum} • Bed {bedNum}</p>
                      <p className="text-xs text-gray-500 mt-1">📞 {phone}</p>
                    </div>
                    
                    <form action={resolveTicket}>
                      <input type="hidden" name="ticket_id" value={ticket.id} />
                      <button type="submit" className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg text-sm shadow-sm flex items-center gap-1">
                        <span>✓</span> Mark Resolved
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}

            {openTickets.length === 0 && (
              <div className="bg-white p-10 rounded-2xl border border-dashed border-gray-300 text-center">
                <p className="text-gray-500 font-medium mt-3">No active issues!</p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: RESOLVED TICKETS */}
        <div>
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">✅ Resolution History</h3>
          <div className="flex flex-col gap-4">
            {resolvedTickets.map((ticket: any) => {
               const dateDisplay = ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('en-IN') : 'Resolved';

               return (
                <div key={ticket.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 opacity-75">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-gray-800">{ticket.issue_type}</span>
                    <span className="bg-green-100 text-green-700 text-[10px] font-extrabold px-2 py-1 rounded uppercase">Resolved</span>
                  </div>
                  <p className="text-gray-600 text-xs line-clamp-2 italic mb-3">"{ticket.description}"</p>
                  
                  <div className="flex justify-between items-center border-t border-gray-50 pt-3">
                    <p className="text-xs text-gray-400 font-medium">Logged: {dateDisplay}</p>
                    <form action={deleteTicket}>
                      <input type="hidden" name="ticket_id" value={ticket.id} />
                      <button type="submit" className="text-gray-400 hover:text-red-500 text-xs font-bold">Delete</button>
                    </form>
                  </div>
                </div>
               );
            })}
          </div>
        </div>

      </div>
    </main>
  );
}
