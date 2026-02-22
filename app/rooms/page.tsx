// Cache buster
export const dynamic = 'force-dynamic';

import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';

export default async function RoomsPage() {
  
  // 1. FETCH ROOMS AND LINK TO THE NEW STUDENT_ADMISSIONS TABLE!
  const { data: rooms, error: fetchError } = await supabase
    .from('rooms')
    .select(`
      id, room_number, capacity, type, room_type, floor, total_capacity,
      beds (
        id, bed_number, is_occupied, monthly_rent,
        student_admissions ( id, full_name, status )
      )
    `)
    .order('room_number', { ascending: true });

  if (fetchError) console.error("❌ FETCH ERROR:", fetchError.message);

  const totalRooms = rooms?.length || 0;
  let totalBeds = 0;
  let occupiedBeds = 0;
  
  rooms?.forEach(room => {
    totalBeds += room.beds?.length || 0;
    occupiedBeds += room.beds?.filter((b: any) => b.is_occupied).length || 0;
  });

  async function addRoom(formData: FormData) {
    'use server';
    const room_number = formData.get('room_number') as string;
    const floor = formData.get('floor') as string;
    const typeValue = formData.get('type') as string;
    const capacity = parseInt(formData.get('capacity') as string);
    const rent = parseFloat(formData.get('rent') as string);

    const { data: newRoom, error: roomError } = await supabase
      .from('rooms')
      .insert([{ 
        room_number, floor, type: typeValue, room_type: typeValue, 
        capacity, total_capacity: capacity 
      }])
      .select()
      .single();

    if (roomError) return;

    if (newRoom) {
      const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const bedsToInsert = [];
      
      for (let i = 0; i < capacity; i++) {
        bedsToInsert.push({
          room_id: newRoom.id,
          bed_number: `${room_number}-${letters[i]}`,
          monthly_rent: rent,
          is_occupied: false
        });
      }
      await supabase.from('beds').insert(bedsToInsert);
    }
    
    revalidatePath('/rooms');
    revalidatePath('/'); 
  }

  async function deleteRoom(formData: FormData) {
    'use server';
    const room_id = formData.get('room_id') as string;
    
    const { data: bedsInRoom } = await supabase.from('beds').select('id').eq('room_id', room_id);
    
    if (bedsInRoom && bedsInRoom.length > 0) {
      const bedIds = bedsInRoom.map((b: any) => b.id);
      // EVICT FROM NEW TABLE BEFORE DELETING BED
      await supabase.from('student_admissions').update({ bed_id: null, room_number: null, bed_number: null }).in('bed_id', bedIds);
      await supabase.from('beds').delete().eq('room_id', room_id);
    }

    await supabase.from('rooms').delete().eq('id', room_id);
    revalidatePath('/rooms');
    revalidatePath('/');
  }

  async function deleteSingleBed(formData: FormData) {
    'use server';
    const bed_id = formData.get('bed_id') as string;

    // EVICT FROM NEW TABLE BEFORE DELETING
    await supabase.from('student_admissions').update({ bed_id: null, room_number: null, bed_number: null }).eq('bed_id', bed_id);
    await supabase.from('beds').delete().eq('id', bed_id);

    revalidatePath('/rooms');
    revalidatePath('/');
  }

  return (
    <main className="flex-1 p-8 lg:p-12 overflow-y-auto bg-[#F8FAFC] h-full font-sans relative">
      
      <div className="absolute top-0 left-0 w-full h-96 overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-200/40 rounded-full blur-3xl mix-blend-multiply opacity-70"></div>
      </div>

      <header className="mb-10 flex justify-between items-end relative z-10">
        <div>
          <h2 className="text-4xl font-black text-slate-800 tracking-tight">🛏️ Bed Allocation Map</h2>
          <p className="text-slate-500 mt-2 font-medium">Absolute Admin Control: Manage rooms, beds, and evictions.</p>
        </div>
        
        <div className="flex gap-4">
          <div className="bg-white px-6 py-4 rounded-3xl shadow-sm border border-emerald-100 text-center">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Capacity</p>
            <p className="text-2xl font-black text-slate-700">{totalBeds} <span className="text-sm text-slate-400 font-medium">Beds</span></p>
          </div>
          <div className="bg-white px-6 py-4 rounded-3xl shadow-sm border border-emerald-100 text-center">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Occupied</p>
            <p className="text-2xl font-black text-indigo-600">{occupiedBeds}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8 relative z-10">
        
        <div className="xl:col-span-1">
          <div className="bg-white p-8 rounded-3xl shadow-lg shadow-slate-200/50 border border-slate-100 sticky top-10">
            <h3 className="text-xl font-black text-slate-800 border-b border-slate-100 pb-4 mb-6">➕ Generate New Room</h3>
            
            <form action={addRoom} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Room Number</label>
                <input type="text" name="room_number" required placeholder="e.g. 101" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Floor</label>
                  <select name="floor" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="Ground">Ground</option>
                    <option value="1st Floor">1st Floor</option>
                    <option value="2nd Floor">2nd Floor</option>
                    <option value="3rd Floor">3rd Floor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Type</label>
                  <select name="type" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="Non-AC">Non-AC</option>
                    <option value="AC">AC</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Beds</label>
                  <select name="capacity" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="1">1 (Single)</option>
                    <option value="2">2 (Double)</option>
                    <option value="3">3 (Triple)</option>
                    <option value="4">4 (Quad)</option>
                    <option value="5">5 (Penta)</option>
                    <option value="6">6 (Hexa)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Rent/Bed</label>
                  <input type="number" name="rent" required placeholder="6000" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
              </div>

              <button type="submit" className="mt-4 w-full bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-indigo-700 transition-colors shadow-md">
                Build Room & Beds
              </button>
            </form>
          </div>
        </div>

        <div className="xl:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-max">
          
          {rooms?.map((room: any) => {
            const displayType = room.room_type || room.type || 'Standard';

            return (
              <div key={room.id} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex flex-col hover:shadow-lg transition-shadow">
                
                <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-black text-slate-800">Room {room.room_number}</h3>
                    <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">{displayType} • {room.floor}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Capacity</span>
                    <span className="bg-slate-200 text-slate-700 text-xs font-extrabold px-2 py-1 rounded-md">{room.capacity || room.total_capacity}</span>
                  </div>
                </div>

                <div className="p-5 flex flex-col gap-3 flex-1">
                  {room.beds?.map((bed: any) => {
                    
                    // SMART FETCH: Get the student name specifically from the new table!
                    let studentName = null;
                    if (bed.student_admissions && bed.student_admissions.length > 0) {
                      // Find the active student assigned to this bed
                      const activeStudent = bed.student_admissions.find((s:any) => s.status === 'ACTIVE');
                      if (activeStudent) studentName = activeStudent.full_name;
                    }

                    const bedBgColor = bed.is_occupied ? 'bg-rose-50/30 border-rose-100' : 'bg-emerald-50/30 border-emerald-100';
                    const dotColor = bed.is_occupied ? 'bg-rose-500' : 'bg-emerald-500';
                    const statusBadge = bed.is_occupied ? 'text-rose-600 bg-rose-100' : 'text-emerald-700 bg-emerald-100';

                    return (
                      <div key={bed.id} className={`p-3 rounded-xl border flex flex-col gap-2 transition-colors ${bedBgColor}`}>
                        <div className="flex justify-between items-center">
                          <p className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${dotColor}`}></span>
                            Bed {bed.bed_number}
                            <span className="text-xs text-slate-400 font-medium ml-1 bg-white/50 px-2 py-0.5 rounded border border-white/60">
                              ₹{Number(bed.monthly_rent || 0).toLocaleString('en-IN')}
                            </span>
                          </p>
                          <span className={`text-[10px] font-extrabold px-2 py-1 rounded uppercase tracking-wider ${statusBadge}`}>
                            {bed.is_occupied ? 'Occupied' : 'Vacant'}
                          </span>
                        </div>
                        
                        <div className="flex justify-between items-end">
                          <div>
                            {bed.is_occupied && studentName && (
                              <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider mt-1 truncate max-w-[120px]">
                                👤 {studentName}
                              </p>
                            )}
                          </div>
                          
                          <form action={deleteSingleBed}>
                            <input type="hidden" name="bed_id" value={bed.id} />
                            <button type="submit" className="text-[10px] font-black uppercase text-slate-400 hover:text-rose-600 bg-white border border-slate-200 hover:border-rose-200 px-2 py-1 rounded transition-colors shadow-sm" title="Delete this specific bed">
                              Remove Bed
                            </button>
                          </form>
                        </div>
                      </div>
                    );
                  })}
                  {(!room.beds || room.beds.length === 0) && (
                    <p className="text-xs text-slate-400 italic text-center py-2">No beds left in this room.</p>
                  )}
                </div>

                <div className="p-4 border-t border-slate-50 bg-slate-50/30 flex justify-end">
                  <form action={deleteRoom}>
                    <input type="hidden" name="room_id" value={room.id} />
                    <button type="submit" className="text-xs font-black uppercase tracking-wider px-4 py-2 rounded-lg text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-colors">
                      Destroy Room
                    </button>
                  </form>
                </div>

              </div>
            );
          })}

          {(!rooms || rooms.length === 0) && (
            <div className="col-span-full p-12 text-center bg-white rounded-3xl border border-dashed border-slate-300 shadow-sm">
              <span className="text-4xl">🏗️</span>
              <p className="text-slate-500 font-medium mt-4">Your hostel has no rooms yet.</p>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}