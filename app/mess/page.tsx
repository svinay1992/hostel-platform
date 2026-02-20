import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';

export default async function MessPage() {
  
  // 1. Fetch the weekly menu
  // Using a specific case statement in SQL to sort days correctly, 
  // but for simplicity here, we'll fetch and sort in JavaScript.
  const { data: menuItems } = await supabase.from('mess_menu').select('*');
  
  const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const sortedMenu = menuItems?.sort((a, b) => daysOrder.indexOf(a.day_of_week) - daysOrder.indexOf(b.day_of_week));

  // 2. SERVER ACTION: Update a specific day's menu
  async function updateMenu(formData: FormData) {
    'use server';
    const id = formData.get('menu_id');
    const breakfast = formData.get('breakfast') as string;
    const lunch = formData.get('lunch') as string;
    const dinner = formData.get('dinner') as string;

    await supabase
      .from('mess_menu')
      .update({ breakfast, lunch, dinner })
      .eq('id', id);

    revalidatePath('/mess');
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      
      

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-10 overflow-y-auto">
        <header className="mb-8">
          <h2 className="text-3xl font-bold text-gray-800">Weekly Mess Menu</h2>
          <p className="text-gray-500 mt-1">Plan and update the meals for your students.</p>
        </header>

        {/* MENU GRID */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {sortedMenu?.map((day: any) => (
            <div key={day.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h3 className="text-xl font-bold text-indigo-600">{day.day_of_week}</h3>
              </div>
              
              {/* UPDATE FORM FOR EACH DAY */}
              <form action={updateMenu} className="flex flex-col gap-3">
                <input type="hidden" name="menu_id" value={day.id} />
                
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">🌅 Breakfast</label>
                  <input type="text" name="breakfast" defaultValue={day.breakfast} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">☀️ Lunch</label>
                  <input type="text" name="lunch" defaultValue={day.lunch} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">🌙 Dinner</label>
                  <input type="text" name="dinner" defaultValue={day.dinner} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>

                <div className="flex justify-end mt-2">
                  <button type="submit" className="text-sm bg-indigo-50 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-100 transition-colors">
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          ))}
        </div>

      </main>
    </div>
  );
}