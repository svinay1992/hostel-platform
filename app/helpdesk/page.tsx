import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';

export default async function HelpdeskPage() {
  
  // 1. Fetch all complaints, joining the student's name and their room number
  const { data: tickets } = await supabase
    .from('complaints')
    .select(`
      id,
      issue_type,
      description,
      status,
      reported_at,
      students (
        users (name),
        beds (rooms(room_number))
      )
    `)
    .order('reported_at', { ascending: false });

  // Calculate quick totals
  const openTickets = tickets?.filter(t => t.status === 'Open').length || 0;
  const inProgressTickets = tickets?.filter(t => t.status === 'In Progress').length || 0;

  // 2. SERVER ACTION: Mark a complaint as Resolved
  async function resolveTicket(formData: FormData) {
    'use server';
    const ticketId = formData.get('ticket_id');
    
    await supabase
      .from('complaints')
      .update({ status: 'Resolved' })
      .eq('id', ticketId);
      
    revalidatePath('/helpdesk');
    revalidatePath('/'); // Updates the main dashboard counter too!
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      
     

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-10 overflow-y-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-800">Maintenance Helpdesk</h2>
            <p className="text-gray-500 mt-1">Track and resolve student complaints.</p>
          </div>
        </header>

        {/* HELPDESK MINI-DASHBOARD */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-orange-500">
            <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Open Tickets</h3>
            <p className="text-4xl font-bold text-gray-800 mt-2">{openTickets}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-blue-500">
            <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">In Progress</h3>
            <p className="text-4xl font-bold text-gray-800 mt-2">{inProgressTickets}</p>
          </div>
        </div>

        {/* TICKET LEDGER TABLE */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-xl font-bold text-gray-800">Active Complaints</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wider">
                  <th className="p-4 font-semibold">Ticket ID</th>
                  <th className="p-4 font-semibold">Room & Student</th>
                  <th className="p-4 font-semibold">Issue Details</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tickets?.map((ticket: any) => (
                  <tr key={ticket.id} className={`hover:bg-gray-50 ${ticket.status === 'Resolved' ? 'opacity-50' : ''}`}>
                    
                    <td className="p-4 text-gray-500 font-mono text-sm">
                      #TKT-{ticket.id.toString().padStart(3, '0')}
                    </td>
                    
                    <td className="p-4">
                      <span className="font-bold text-gray-800 bg-gray-100 px-2 py-1 rounded text-xs mr-2">
                        Room {ticket.students?.beds?.rooms?.room_number}
                      </span>
                      <span className="font-medium text-gray-700">{ticket.students?.users?.name}</span>
                    </td>
                    
                    <td className="p-4">
                      <p className="font-bold text-gray-800 text-sm">{ticket.issue_type}</p>
                      <p className="text-gray-500 text-sm mt-1 max-w-xs truncate">{ticket.description}</p>
                    </td>
                    
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        ticket.status === 'Resolved' ? 'bg-green-100 text-green-700' :
                        ticket.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {ticket.status}
                      </span>
                    </td>
                    
                    <td className="p-4">
                      {/* RESOLVE BUTTON */}
                      {ticket.status !== 'Resolved' && (
                        <form action={resolveTicket}>
                          <input type="hidden" name="ticket_id" value={ticket.id} />
                          <button type="submit" className="text-sm bg-green-50 text-green-700 font-bold py-2 px-3 rounded hover:bg-green-100 flex items-center gap-1">
                            ✓ Mark Resolved
                          </button>
                        </form>
                      )}
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