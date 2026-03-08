// Cache buster
export const dynamic = 'force-dynamic';

import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ view?: string, add?: string }> }) {
  
  const resolvedParams = await searchParams;
  const viewId = resolvedParams?.view;
  const showAddForm = resolvedParams?.add === 'true';

  // 1. FETCH FROM THE NEW CHATGPT TABLE
  const { data: students } = await supabase
    .from('student_admissions')
    .select('*')
    .order('created_at', { ascending: false });

  // 2. FETCH VACANT BEDS (For the dropdown)
  const { data: bedsWithAdmissions } = await supabase
    .from('beds')
    .select('id, bed_number, rooms(room_number), student_admissions ( id, status )')
    .order('bed_number', { ascending: true });

  const vacantBeds = (bedsWithAdmissions || []).filter((bed: any) => {
    const admissions = Array.isArray(bed.student_admissions) ? bed.student_admissions : [];
    return !admissions.some((student: any) => student.status === 'ACTIVE');
  });

  const activeStudents = students?.filter(s => s.status === 'ACTIVE') || [];

  // 3. SERVER ACTION: Complete Admission
  async function admitStudent(formData: FormData) {
    'use server';
    
    // Extracting strict required fields
    const full_name = (formData.get('full_name') as string)?.trim();
    const email = (formData.get('email') as string)?.trim().toLowerCase();
    const phone = (formData.get('phone') as string)?.replace(/\s+/g, '');
    const date_of_birth = formData.get('date_of_birth') as string;
    const home_address = formData.get('home_address') as string;
    const parent_name = formData.get('parent_name') as string;
    const parent_phone = formData.get('parent_phone') as string;
    
    // Optional & Enum fields
    const blood_group = formData.get('blood_group') as string;
    const coaching_name = formData.get('coaching_name') as string;
    const course = formData.get('course') as string;
    const timing = formData.get('timing') as string;
    const food_preference = formData.get('food_preference') as string;

    // Financial Data
    const security_deposit = parseFloat(formData.get('security_deposit') as string) || 0;
    const sd_date = formData.get('deposit_date') as string;
    const deposit_date = sd_date ? sd_date : null;
    
    const advance_rent = parseFloat(formData.get('advance_rent') as string) || 0;
    const ar_date = formData.get('rent_date') as string;
    const rent_date = ar_date ? ar_date : null;

    // Bed Allocation Logic
    const bed_id_raw = formData.get('bed_id') as string;
    let bed_id = null;
    let room_number = null;
    let bed_number = null;

    if (bed_id_raw !== 'unassigned') {
      bed_id = parseInt(bed_id_raw);
      const { data: activeOccupant } = await supabase
        .from('student_admissions')
        .select('id')
        .eq('bed_id', bed_id)
        .eq('status', 'ACTIVE')
        .maybeSingle();
      if (activeOccupant) {
        console.error("BED ALREADY OCCUPIED:", bed_id);
        redirect('/students?add=true');
      }
      const { data: bedData } = await supabase.from('beds').select('bed_number, rooms(room_number)').eq('id', bed_id).single();
      if (bedData) {
        bed_number = bedData.bed_number;
        room_number = (bedData.rooms as any)?.room_number;
      }
    }

    // ==========================================
    // 🔑 PORTAL LOGIN CREATION LOGIC
    // ==========================================
    let targetUserId = null;
    const { data: existingUser } = await supabase.from('users').select('id').eq('email', email).single();

    if (existingUser) {
      targetUserId = existingUser.id;
      // If student exists, forcefully update their password to the newly provided phone number
      await supabase.from('users').update({ password: phone }).eq('id', targetUserId);
    } else {
      // Create new portal login: Email = Username, Phone = Password
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert([{ 
          name: full_name, 
          email: email, 
          role: 'student',
          password: phone // 👈 THE MAGIC FIX!
        }])
        .select()
        .single();
      
      if (userError) return console.error("❌ USER ERROR:", userError.message);
      targetUserId = newUser.id;
    }

    // Insert directly into the new student table
    if (targetUserId) {
      const { error: studentError } = await supabase.from('student_admissions').insert([{
        full_name, email, phone, date_of_birth, blood_group, home_address,
        parent_name, parent_phone, coaching_name, course, timing,
        food_preference, room_number, bed_number, bed_id,
        security_deposit, deposit_date, advance_rent, rent_date,
        status: 'ACTIVE'
      }]);

      if (studentError) {
        console.error("❌ INSERT ERROR:", studentError.message);
      } else {
        // Keep legacy `students` table in sync for modules using student_id FK (e.g. complaints)
        const { data: legacyStudent } = await supabase
          .from('students')
          .select('id')
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (!legacyStudent?.id) {
          const { error: legacyInsertError } = await supabase.from('students').insert([{
            user_id: targetUserId,
            phone_number: phone || null,
            bed_id: bed_id || null,
            security_deposit: security_deposit || 0,
            advance_rent: advance_rent || 0,
          }]);
          if (legacyInsertError) {
            console.error("❌ LEGACY STUDENT SYNC ERROR:", legacyInsertError.message);
          }
        } else {
          const { error: legacyUpdateError } = await supabase
            .from('students')
            .update({
              phone_number: phone || null,
              bed_id: bed_id || null,
              security_deposit: security_deposit || 0,
              advance_rent: advance_rent || 0,
            })
            .eq('id', legacyStudent.id);
          if (legacyUpdateError) {
            console.error("❌ LEGACY STUDENT UPDATE ERROR:", legacyUpdateError.message);
          }
        }

        // Mark bed as occupied
        if (bed_id) {
          await supabase.from('beds').update({ is_occupied: true }).eq('id', bed_id);
        }
      }
    }

    revalidatePath('/students');
    revalidatePath('/rooms');
    revalidatePath('/');
    redirect('/students'); 
  }

  // 4. SERVER ACTION: Evict / Move to Alumni
  async function moveToAlumni(formData: FormData) {
    'use server';
    const id = formData.get('id') as string;
    const bed_id = formData.get('bed_id') as string;

    await supabase.from('student_admissions').update({ status: 'LEFT', bed_id: null, room_number: null, bed_number: null }).eq('id', id);
    if (bed_id) {
      await supabase.from('students').update({ bed_id: null }).eq('bed_id', bed_id);
      await supabase.from('beds').update({ is_occupied: false }).eq('id', bed_id);
    }

    revalidatePath('/students');
    revalidatePath('/rooms');
    revalidatePath('/');
  }

  const viewingStudent = viewId ? students?.find((s: any) => s.id.toString() === viewId) : null;

  return (
    <main className="flex-1 p-8 lg:p-12 overflow-y-auto bg-[#F8FAFC] h-full font-sans relative">
      
      <div className="absolute top-0 left-0 w-full h-96 overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-200/40 rounded-full blur-3xl mix-blend-multiply opacity-70"></div>
      </div>

      <header className="mb-10 flex justify-between items-end relative z-10">
        <div>
          <h2 className="text-4xl font-black text-slate-800 tracking-tight">🎓 Student Directory</h2>
          <p className="text-slate-500 mt-2 font-medium">Manage admissions using the new flat-table structure.</p>
        </div>
        
        <div className="flex gap-4">
          <div className="bg-white px-6 py-4 rounded-3xl shadow-sm border border-slate-100 text-center">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Active Residents</p>
            <p className="text-2xl font-black text-indigo-600">{activeStudents.length}</p>
          </div>
          <Link href="/students?add=true" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-4 rounded-3xl transition-all shadow-md hover:shadow-lg flex items-center gap-2">
            <span className="text-xl">+</span> Admit New Student
          </Link>
        </div>
      </header>

      {/* DIRECTORY TABLE */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden relative z-10 mb-8">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-lg font-black text-slate-800">Current Residents</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white text-slate-400 text-xs uppercase tracking-widest border-b border-slate-100">
              <tr>
                <th className="p-6">Resident Details</th>
                <th className="p-6">Contact & Emergency</th>
                <th className="p-6">Room & Bed</th>
                <th className="p-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm bg-white">
              {activeStudents.map((student: any) => (
                <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-6">
                    <p className="font-bold text-slate-900 text-base">{student.full_name}</p>
                    <p className="text-xs text-slate-500 mt-1">{student.coaching_name || 'No Coaching Info'} • {student.food_preference}</p>
                  </td>
                  <td className="p-6">
                    <p className="font-medium text-slate-700">📞 {student.phone}</p>
                    <p className="text-xs text-rose-500 font-bold mt-1 tracking-wide">SOS: {student.parent_name} ({student.parent_phone})</p>
                  </td>
                  <td className="p-6">
                    {student.bed_id ? (
                      <div>
                        <p className="font-black text-indigo-600">Room {student.room_number}</p>
                        <p className="text-xs text-slate-500 font-bold mt-1">Bed {student.bed_number}</p>
                      </div>
                    ) : (
                      <span className="text-xs font-bold italic text-slate-400">Unassigned</span>
                    )}
                  </td>
                  <td className="p-6">
                    <div className="flex justify-center items-center gap-3">
                      <Link href={`/students?view=${student.id}`} className="text-indigo-600 hover:text-indigo-800 font-bold text-xs uppercase tracking-wider bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-lg transition-colors">
                        View Profile
                      </Link>
                      
                      <form action={moveToAlumni}>
                        <input type="hidden" name="id" value={student.id} />
                        <input type="hidden" name="bed_id" value={student.bed_id || ''} />
                        <button type="submit" className="text-rose-500 hover:text-rose-700 font-bold text-xs uppercase tracking-wider bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-lg transition-colors">
                          Move Out
                        </button>
                      </form>

                    </div>
                  </td>
                </tr>
              ))}
              {activeStudents.length === 0 && (
                <tr><td colSpan={4} className="p-12 text-center text-slate-400 italic">No active students currently residing.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADMISSION FORM MODAL */}
      {showAddForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-center items-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl overflow-hidden my-8 border border-white/20">
            
            <div className="bg-indigo-600 p-6 flex justify-between items-center text-white">
              <div>
                <h3 className="text-2xl font-black tracking-tight">📝 New Student Admission</h3>
                <p className="text-indigo-200 text-sm mt-1 font-medium">Fill in all details to secure a bed.</p>
              </div>
              <Link href="/students" className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-xl transition-colors backdrop-blur-md">✕</Link>
            </div>

            <form action={admitStudent} className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                
                {/* PERSONAL INFO */}
                <div className="flex flex-col gap-4">
                  <h4 className="font-black text-slate-800 border-b border-slate-100 pb-2 uppercase tracking-widest text-xs">Personal Info</h4>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Full Name</label>
                    <input type="text" name="full_name" required placeholder="e.g. Rahul Kumar" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Email Address (PORTAL USERNAME)</label>
                    <input type="email" name="email" required placeholder="rahul@example.com" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Date of Birth</label>
                      <input type="date" name="date_of_birth" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Blood Group</label>
                      <select name="blood_group" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none">
                        <option value="">-- Select --</option>
                        <option value="A+">A+</option><option value="O+">O+</option><option value="B+">B+</option><option value="AB+">AB+</option>
                        <option value="A-">A-</option><option value="O-">O-</option><option value="B-">B-</option><option value="AB-">AB-</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Home Address</label>
                    <textarea name="home_address" required rows={2} placeholder="Full residential address" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"></textarea>
                  </div>
                </div>

                {/* ACADEMICS & CONTACT */}
                <div className="flex flex-col gap-4">
                  <h4 className="font-black text-slate-800 border-b border-slate-100 pb-2 uppercase tracking-widest text-xs">Academics & Contact</h4>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Phone Number (PORTAL PASSWORD)</label>
                    <input type="text" name="phone" required placeholder="9876543210" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 text-rose-500">Parent Name</label>
                      <input type="text" name="parent_name" required placeholder="Name" className="w-full bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium placeholder-rose-300 focus:ring-2 focus:ring-rose-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 text-rose-500">Parent Phone</label>
                      <input type="text" name="parent_phone" required placeholder="Number" className="w-full bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium placeholder-rose-300 focus:ring-2 focus:ring-rose-500 outline-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Coaching / College Name</label>
                    <input type="text" name="coaching_name" placeholder="e.g. Allen, Resonance" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Course</label>
                      <select name="course" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none">
                        <option value="OTHER">Other</option>
                        <option value="JEE">JEE</option>
                        <option value="NEET">NEET</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Timing</label>
                      <input type="text" name="timing" placeholder="8 AM - 2 PM" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                </div>

                {/* HOSTEL ALLOCATION */}
                <div className="flex flex-col gap-4">
                  <h4 className="font-black text-slate-800 border-b border-slate-100 pb-2 uppercase tracking-widest text-xs">Hostel Allocation</h4>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Food</label>
                    <select name="food_preference" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none">
                      <option value="PURE_VEG">🥦 Pure Veg</option>
                      <option value="VEG">🥕 Veg</option>
                      <option value="NON_VEG">🍗 Non-Veg</option>
                    </select>
                  </div>
                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 mt-2">
                    <label className="block text-xs font-black text-indigo-800 uppercase tracking-wider mb-2">Assign Bed</label>
                    <select name="bed_id" className="w-full bg-white border border-indigo-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm">
                      <option value="unassigned">-- Do not assign bed yet --</option>
                      {vacantBeds?.map((bed: any) => (
                        <option key={bed.id} value={bed.id}>
                          Room {bed.rooms?.room_number} - Bed {bed.bed_number}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* INITIAL PAYMENTS */}
                  <div className="mt-2 pt-4 border-t border-slate-100">
                    <h4 className="font-black text-emerald-700 uppercase tracking-widest text-[10px] mb-3">Initial Payments</h4>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Security Deposit</label>
                        <input type="number" name="security_deposit" placeholder="₹5000" className="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-3 py-2 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Deposit Date</label>
                        <input type="date" name="deposit_date" defaultValue={new Date().toISOString().slice(0, 10)} className="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-3 py-2 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Advance Rent</label>
                        <input type="number" name="advance_rent" placeholder="₹6000" className="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-3 py-2 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Rent Date</label>
                        <input type="date" name="rent_date" defaultValue={new Date().toISOString().slice(0, 10)} className="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-3 py-2 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                    </div>
                  </div>

                </div>

              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 flex gap-4 justify-end">
                <Link href="/students" className="px-8 py-4 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-colors">Cancel</Link>
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-12 py-4 rounded-xl shadow-lg transition-transform hover:-translate-y-1">Confirm Admission</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW PROFILE MODAL */}
      {viewingStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-white/20 relative">
            
            <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/30 rounded-full blur-[50px] -translate-y-1/2 translate-x-1/3"></div>
              <div className="relative z-10 flex justify-between items-start">
                <div>
                  <h3 className="text-3xl font-black tracking-tighter">{viewingStudent.full_name}</h3>
                  <p className="text-indigo-300 font-medium tracking-widest uppercase text-xs mt-2">{viewingStudent.room_number ? `Room ${viewingStudent.room_number} • Bed ${viewingStudent.bed_number}` : 'Unassigned Bed'}</p>
                </div>
                <Link href="/students" className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-sm transition-colors backdrop-blur-md">✕</Link>
              </div>
            </div>

            <div className="p-8 grid grid-cols-2 gap-y-6 gap-x-8">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Phone & Email</p>
                <p className="font-bold text-slate-800">{viewingStudent.phone}</p>
                <p className="font-bold text-slate-500 text-xs mt-1">{viewingStudent.email}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">DOB / Blood Group</p>
                <p className="font-bold text-slate-800">{viewingStudent.date_of_birth ? new Date(viewingStudent.date_of_birth).toLocaleDateString('en-IN') : 'N/A'} <span className="text-rose-500 ml-2">{viewingStudent.blood_group || 'N/A'}</span></p>
              </div>
              
              <div className="col-span-2 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 flex justify-between items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-200/40 rounded-full blur-[30px] -translate-y-1/2 translate-x-1/2"></div>
                <div className="relative z-10">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Total Initial Payment</p>
                  <p className="font-black text-emerald-700 text-3xl">₹{viewingStudent.total_paid || 0}</p>
                </div>
                <div className="relative z-10 text-right">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Breakdown</p>
                  <p className="font-bold text-slate-800 text-sm">Deposit: ₹{viewingStudent.security_deposit || 0}</p>
                  <p className="font-bold text-slate-800 text-sm">Rent: ₹{viewingStudent.advance_rent || 0}</p>
                </div>
              </div>

              <div className="col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Coaching & Academics</p>
                <p className="font-bold text-slate-800">{viewingStudent.coaching_name || 'N/A'} • {viewingStudent.course}</p>
                <p className="text-xs text-slate-500 mt-1">Batch Timings: {viewingStudent.timing || 'N/A'}</p>
              </div>
              <div className="col-span-1 bg-rose-50 p-4 rounded-xl border border-rose-100">
                <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1">Emergency (Parent)</p>
                <p className="font-black text-rose-600 text-sm">{viewingStudent.parent_name}</p>
                <p className="font-black text-rose-600 text-lg mt-1">{viewingStudent.parent_phone}</p>
              </div>
              <div className="col-span-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Food & Diet</p>
                <p className="font-bold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100 inline-block mt-1">{viewingStudent.food_preference}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Home Address</p>
                <p className="font-medium text-slate-700 text-sm leading-relaxed">{viewingStudent.home_address}</p>
              </div>
            </div>

          </div>
        </div>
      )}

    </main>
  );
}
