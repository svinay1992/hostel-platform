import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';

export default async function StudentsPage() {
  
  // 1. Fetch Students (Joined with their Bed and Room info)
  const { data: students } = await supabase
    .from('students')
    .select(`
      id,
      phone_number,
      users (name, email),
      beds (bed_number, rooms(room_number))
    `)
    .order('id', { ascending: false });

  // 2. Fetch ONLY Vacant Beds for the Dropdown Menu
  const { data: vacantBeds } = await supabase
    .from('beds')
    .select('id, bed_number, rooms(room_number)')
    .eq('is_occupied', false);

  // 3. THE UPGRADED SERVER ACTION
  async function addStudent(formData: FormData) {
    'use server';
    
    // Get form values
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;
    const bedId = formData.get('bed_id') as string;

    // STEP A: Create the User
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert([{ name, email, role: 'student' }])
      .select()
      .single(); // Returns the newly created user so we can get their ID

    if (newUser && !userError) {
      // STEP B: Create the Student Profile and link to the Bed
      await supabase
        .from('students')
        .insert([{
          user_id: newUser.id,
          bed_id: parseInt(bedId),
          phone_number: phone,
          guardian_contact: '0000000000', // Dummy data for now
          admission_date: new Date().toISOString().split('T')[0], // Today's Date
          security_deposit: 10000.00 // Default deposit
        }]);

      // STEP C: Flip the Bed Status to Occupied (Red)
      await supabase
        .from('beds')
        .update({ is_occupied: true })
        .eq('id', parseInt(bedId));
    }

    // Refresh all pages so the numbers update everywhere instantly
    revalidatePath('/students');
    revalidatePath('/rooms');
    revalidatePath('/');
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      
      {/* SIDEBAR NAVIGATION */}
    

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-10 overflow-y-auto">
        <header className="mb-8">
          <h2 className="text-3xl font-bold text-gray-800">Student Admissions</h2>
          <p className="text-gray-500 mt-1">Admit new students and assign them a vacant bed.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* THE ADMISSION FORM */}
          <div className="lg:col-span-1">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="text-xl font-bold text-gray-800 mb-4">New Admission</h3>
              
              <form action={addStudent} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input type="text" name="name" required placeholder="e.g. Arjun Patel" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" name="email" required placeholder="arjun@example.com" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input type="tel" name="phone" required placeholder="9876543210" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500" />
                </div>
                
                {/* THE SMART BED DROPDOWN */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assign Bed</label>
                  <select name="bed_id" required className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="">-- Select a Vacant Bed --</option>
                    {vacantBeds?.map((bed: any) => (
                      <option key={bed.id} value={bed.id}>
                        Room {bed.rooms?.room_number} - Bed {bed.bed_number}
                      </option>
                    ))}
                  </select>
                </div>

                <button type="submit" className="mt-4 bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                  Complete Admission
                </button>
              </form>
            </div>
          </div>

          {/* THE LIVE DATA TABLE */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <h3 className="text-xl font-bold text-gray-800">Active Residents</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wider">
                      <th className="p-4 font-semibold">Student Name</th>
                      <th className="p-4 font-semibold">Contact</th>
                      <th className="p-4 font-semibold">Room & Bed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {students?.map((student: any) => (
                      <tr key={student.id} className="hover:bg-gray-50">
                        <td className="p-4">
                          <p className="font-medium text-gray-800">{student.users?.name}</p>
                          <p className="text-xs text-gray-500">{student.users?.email}</p>
                        </td>
                        <td className="p-4 text-gray-600">{student.phone_number}</td>
                        <td className="p-4">
                          <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-md text-sm font-bold border border-blue-100">
                            Room {student.beds?.rooms?.room_number} • {student.beds?.bed_number}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}