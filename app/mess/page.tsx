import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';
import { addActivityLog } from '../../lib/activity-log-cache';

export default async function MessMenuPage() {
  
  // 1. Fetch the full weekly menu, sorted properly Monday -> Sunday
  const { data: menuItems } = await supabase
    .from('mess_menu')
    .select('*')
    .order('sort_order', { ascending: true });

  // 2. SERVER ACTION: Update a specific day's menu
  async function updateMenu(formData: FormData) {
    'use server';
    const day_of_week = formData.get('day_of_week') as string;
    const breakfast = formData.get('breakfast') as string;
    const lunch = formData.get('lunch') as string;
    const dinner = formData.get('dinner') as string;

    await supabase
      .from('mess_menu')
      .update({ breakfast, lunch, dinner })
      .eq('day_of_week', day_of_week);

    // Push a portal-visible notice so students receive live popup notification.
    await supabase.from('notices').insert([{
      title: `Mess Menu Updated - ${day_of_week}`,
      message: `Today's menu changed. Breakfast: ${breakfast}. Lunch: ${lunch}. Dinner: ${dinner}.`,
      is_urgent: false,
    }]);
    await addActivityLog({
      module: 'Mess',
      action: 'Menu Updated',
      details: `${day_of_week}: breakfast/lunch/dinner menu changed`,
      actor: 'admin',
      level: 'info',
    });

    revalidatePath('/mess');
    revalidatePath('/portal'); // Instantly pushes the new food to the students!
  }

  return (
    <main className="flex-1 p-10 overflow-y-auto bg-gray-50 h-full font-sans">
      <header className="mb-10">
        <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">🍲 Mess & Menu Controller</h2>
        <p className="text-gray-500 mt-1">Manage the weekly food schedule for the hostel.</p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: The Update Form */}
        <div className="xl:col-span-1">
          <form action={updateMenu} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-5 sticky top-10">
            <h3 className="text-xl font-bold text-gray-800 border-b border-gray-100 pb-3">Update Daily Menu</h3>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Select Day</label>
              <select name="day_of_week" required className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                <option value="Monday">Monday</option>
                <option value="Tuesday">Tuesday</option>
                <option value="Wednesday">Wednesday</option>
                <option value="Thursday">Thursday</option>
                <option value="Friday">Friday</option>
                <option value="Saturday">Saturday</option>
                <option value="Sunday">Sunday</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Breakfast</label>
              <input type="text" name="breakfast" required placeholder="e.g. Aloo Paratha" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-orange-400 outline-none" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Lunch</label>
              <input type="text" name="lunch" required placeholder="e.g. Rajma Chawal" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-blue-400 outline-none" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Dinner</label>
              <input type="text" name="dinner" required placeholder="e.g. Paneer Butter Masala" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-400 outline-none" />
            </div>

            <button type="submit" className="mt-2 w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
              Publish New Menu
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: The Live Weekly Schedule */}
        <div className="xl:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">Live Weekly Schedule</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="p-5">Day</th>
                    <th className="p-5 text-orange-600">Breakfast</th>
                    <th className="p-5 text-blue-600">Lunch</th>
                    <th className="p-5 text-indigo-600">Dinner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm">
                  {menuItems?.map((item: any) => (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="p-5 font-extrabold text-gray-900">{item.day_of_week}</td>
                      <td className="p-5 font-medium text-gray-700 bg-orange-50/30">{item.breakfast}</td>
                      <td className="p-5 font-medium text-gray-700 bg-blue-50/30">{item.lunch}</td>
                      <td className="p-5 font-medium text-gray-700 bg-indigo-50/30">{item.dinner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
