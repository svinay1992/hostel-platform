import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';

export default async function StudentsPage() {
  
  // 1. Fetch all students and their assigned beds
  const { data: students } = await supabase
    .from('students')
    .select('id, phone_number, bed_id, users(name, email), beds(bed_number, rooms(room_number))')
    .order('id', { ascending: false });

  // 2. Fetch only VACANT beds for the admission form
  const { data: availableBeds } = await supabase
    .from('beds')
    .select('id, bed_number, rooms(room_number)')
    .eq('is_occupied', false)
    .order('bed_number', { ascending: true });

  // 3. SERVER ACTION: Admit a new student
  async function addStudent(formData: FormData) {
    'use server';
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;
    const bed_id = formData.get('bed_id') as string;

    // A. Create the base user
    const { data: newUser } = await supabase.from('users').insert([{ name, email, role: 'student' }]).select().single();
    
    if (newUser) {
      // B. Create the student profile
      await supabase.from('students').insert([{ user_id: newUser.id, phone_number: phone, bed_id }]);
      // C. Mark that bed as occupied!
      await supabase.from('beds').update({ is_occupied: true }).eq('id', bed_id);
    }
    
    revalidatePath('/students');
    revalidatePath('/rooms');
    revalidatePath('/'); 
  }

  // 4. SERVER ACTION: Move a student out safely
  async function moveOutStudent(formData: FormData) {
    'use server';
    const student_id = formData.get('student_id') as string;
    const bed_id = formData.get('bed_id') as string;

    // A. Free up the bed so someone else can rent it
    if (bed_id) {
      await supabase.from('beds').update({ is_occupied: false }).eq('id', bed_id);
    }
    
    // B. Un-assign the bed from the student
    await supabase.from('students').update({ bed_id: null }).eq('id', student_id);

    revalidatePath('/students');
    revalidatePath('/rooms');
    revalidatePath('/'); 
  }

  return (
    <main className="flex-1 p-10 overflow-y-auto bg-gray-50 h-full font-sans">
      <header className="mb-10">
        <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">🎓 Student Directory</h2>
        <p className="text-gray-500 mt-1">Manage admissions, room assignments, and move-outs.</p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: Admission Form */}
        <div className="xl:col-span-1">
          <form action={addStudent} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-5 sticky top-10">
            <h3 className="text-xl font-bold text-gray-800 border-b border-gray-100 pb-3">Admit New Student</h3>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Full Name</label>
              <input type="text" name="name" required placeholder="e.g. Rahul Kumar" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Email Address</label>
              <input type="email" name="email" required placeholder="rahul@example.com" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Phone Number</label>
              <input type="text" name="phone" required placeholder="9876543210" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Assign Bed</label>
              <select name="bed_id" required className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                <option value="">-- Select an available bed --</option>
                {availableBeds?.map((bed: any) => (
                  <option key={bed.id} value={bed.id}>
                    Room {bed.rooms?.room_number} - Bed {bed.bed_number}
                  </option>
                ))}
              </select>
              {(!availableBeds || availableBeds.length === 0) && (
                <p className="text-xs text-red-500 mt-2 font-bold">No beds available! Add rooms first.</p>
              )}
            </div>

            <button type="submit" disabled={!availableBeds || availableBeds.length === 0} className="mt-2 w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:bg-gray-400 disabled:cursor-not-allowed">
              Complete Admission
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: The Students Table */}
        <div className="xl:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="p-5">Student Details</th>
                    <th className="p-5">Contact</th>
                    <th className="p-5">Room & Bed</th>
                    <th className="p-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm">
                  {students?.map((student: any) => {
                    const isMovedOut = !student.bed_id;

                    return (
                      <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="p-5">
                          <p className="font-bold text-gray-900">{student.users?.name}</p>
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${isMovedOut ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                            {isMovedOut ? 'Alumni / Moved Out' : 'Active Resident'}
                          </span>
                        </td>
                        <td className="p-5">
                          <p className="text-gray-800 font-medium">{student.users?.email}</p>
                          <p className="text-gray-500 text-xs mt-0.5">{student.phone_number}</p>
                        </td>
                        <td className="p-5">
                          {isMovedOut ? (
                            <span className="text-gray-400 italic">Unassigned</span>
                          ) : (
                            <div>
                              <p className="font-bold text-indigo-700">Room {student.beds?.rooms?.room_number}</p>
                              <p className="text-gray-500 text-xs mt-0.5">Bed {student.beds?.bed_number}</p>
                            </div>
                          )}
                        </td>
                        <td className="p-5 text-right">
                          {!isMovedOut && (
                            <form action={moveOutStudent}> {/* THE FIX: Removed onSubmit event handler */}
                              <input type="hidden" name="student_id" value={student.id} />
                              <input type="hidden" name="bed_id" value={student.bed_id} />
                              <button type="submit" className="text-xs bg-red-50 hover:bg-red-100 text-red-600 font-bold py-2 px-3 rounded-lg transition-colors border border-red-100">
                                Move Out
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}