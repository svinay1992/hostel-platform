import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';
import { addActivityLog } from '../../lib/activity-log-cache';

export default async function AnnouncementsPage() {
  
  // 1. Fetch all previous notices
  const { data: notices } = await supabase
    .from('notices')
    .select('*')
    .order('created_at', { ascending: false });

  // 2. SERVER ACTION: Publish a new notice
  async function publishNotice(formData: FormData) {
    'use server';
    const title = formData.get('title') as string;
    const message = formData.get('message') as string;
    const is_urgent = formData.get('is_urgent') === 'on';

    await supabase.from('notices').insert([{
      title,
      message,
      is_urgent
    }]);
    await addActivityLog({
      module: 'Announcements',
      action: 'Notice Published',
      details: `${title}${is_urgent ? ' [URGENT]' : ''}`,
      actor: 'admin',
      level: is_urgent ? 'warning' : 'info',
    });

    revalidatePath('/announcements');
    revalidatePath('/portal'); // Instantly updates the student portal too!
  }

  // SERVER ACTION: Delete a notice
  async function deleteNotice(formData: FormData) {
    'use server';
    const id = formData.get('id') as string;
    const { data: notice } = await supabase.from('notices').select('title').eq('id', id).single();
    await supabase.from('notices').delete().eq('id', id);
    await addActivityLog({
      module: 'Announcements',
      action: 'Notice Deleted',
      details: `${notice?.title || `Notice #${id}`} removed`,
      actor: 'admin',
      level: 'warning',
    });
    revalidatePath('/announcements');
    revalidatePath('/portal');
  }

  return (
    <main className="flex-1 p-10 overflow-y-auto bg-gray-50 h-full font-sans">
      <header className="mb-10">
        <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">📢 Digital Notice Board</h2>
        <p className="text-gray-500 mt-1">Broadcast messages to all student portals instantly.</p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: The Notice Form */}
        <div className="xl:col-span-1">
          <form action={publishNotice} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-5 sticky top-10">
            <h3 className="text-xl font-bold text-gray-800 border-b border-gray-100 pb-3">Draft New Notice</h3>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Notice Title</label>
              <input type="text" name="title" required placeholder="e.g. Wi-Fi Maintenance" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Message</label>
              <textarea name="message" required rows={4} placeholder="Type your full announcement here..." className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"></textarea>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" name="is_urgent" id="urgent" className="w-5 h-5 accent-red-500" />
              <label htmlFor="urgent" className="text-sm font-bold text-red-600">Mark as Urgent Priority 🚨</label>
            </div>

            <button type="submit" className="mt-2 w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
              Publish to Students
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: Published Notices Feed */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          <h3 className="text-xl font-bold text-gray-800 mb-2">Live Broadcasts</h3>
          
          {notices?.map((notice: any) => (
            <div key={notice.id} className={`bg-white p-6 rounded-2xl shadow-sm border-l-4 ${notice.is_urgent ? 'border-l-red-500' : 'border-l-indigo-500'} flex justify-between items-start`}>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="text-lg font-bold text-gray-900">{notice.title}</h4>
                  {notice.is_urgent && (
                    <span className="bg-red-100 text-red-700 text-xs font-extrabold px-2 py-1 rounded">URGENT</span>
                  )}
                </div>
                <p className="text-gray-600 text-sm whitespace-pre-wrap">{notice.message}</p>
                <p className="text-xs text-gray-400 mt-4 font-medium">
                  Published: {new Date(notice.created_at).toLocaleString('en-IN')}
                </p>
              </div>
              
              <form action={deleteNotice}>
                <input type="hidden" name="id" value={notice.id} />
                <button type="submit" className="text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 p-2 rounded-lg transition-colors" title="Delete Notice">
                  🗑️
                </button>
              </form>
            </div>
          ))}

          {(!notices || notices.length === 0) && (
            <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-300">
              <span className="text-4xl">📭</span>
              <p className="text-gray-500 mt-3 font-medium">No active notices.</p>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
