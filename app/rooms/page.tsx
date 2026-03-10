// Cache buster
export const dynamic = 'force-dynamic';

import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import FloorWiseRoomMap from '../_components/floor-wise-room-map';
import { addActivityLog } from '../../lib/activity-log-cache';
import ClearQueryOnce from '../_components/clear-query-once';

function getOrdinalFloorLabel(floorNumber: number) {
  const suffix = floorNumber % 10 === 1 && floorNumber % 100 !== 11
    ? 'st'
    : floorNumber % 10 === 2 && floorNumber % 100 !== 12
      ? 'nd'
      : floorNumber % 10 === 3 && floorNumber % 100 !== 13
        ? 'rd'
        : 'th';

  return `${floorNumber}${suffix} Floor`;
}

export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ error?: string; floor?: string; room?: string }> }) {
  const resolvedParams = await searchParams;
  const roomDeleteBlocked = resolvedParams?.error === 'room_has_students';
  const roomNumberDuplicate = resolvedParams?.error === 'room_duplicate';
  const duplicateFloor = resolvedParams?.floor ? String(resolvedParams.floor) : null;
  const duplicateRoomNumber = resolvedParams?.room ? String(resolvedParams.room) : null;

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

  if (fetchError) console.error('FETCH ERROR:', fetchError.message);

  let totalBeds = 0;
  let occupiedBeds = 0;

  rooms?.forEach((room) => {
    totalBeds += room.beds?.length || 0;
    occupiedBeds +=
      room.beds?.filter((bed) => {
        const admissions = Array.isArray(bed.student_admissions) ? bed.student_admissions : [];
        return admissions.some((student) => student.status === 'ACTIVE');
      }).length || 0;
  });

  async function addRoom(formData: FormData) {
    'use server';
    const room_number = formData.get('room_number') as string;
    const floor = formData.get('floor') as string;
    const typeValue = formData.get('type') as string;
    const capacity = parseInt(formData.get('capacity') as string);
    const rent = parseFloat(formData.get('rent') as string);

    const normalizedRoomNumber = (room_number || '').trim();
    const normalizedFloor = (floor || '').trim();
    if (!normalizedRoomNumber || !normalizedFloor) return;

    const { data: existingRoom } = await supabase
      .from('rooms')
      .select('id')
      .eq('room_number', normalizedRoomNumber)
      .eq('floor', normalizedFloor)
      .maybeSingle();

    if (existingRoom?.id) {
      return redirect(`/rooms?error=room_duplicate&floor=${encodeURIComponent(normalizedFloor)}&room=${encodeURIComponent(normalizedRoomNumber)}`);
    }

    const { data: newRoom, error: roomError } = await supabase
      .from('rooms')
      .insert([
        {
          room_number: normalizedRoomNumber,
          floor: normalizedFloor,
          type: typeValue,
          room_type: typeValue,
          capacity,
          total_capacity: capacity,
        },
      ])
      .select()
      .single();

    if (roomError) return;

    if (newRoom) {
      const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const bedsToInsert = [];

      for (let i = 0; i < capacity; i++) {
        bedsToInsert.push({
          room_id: newRoom.id,
          bed_number: `${normalizedRoomNumber}-${letters[i]}`,
          monthly_rent: rent,
          is_occupied: false,
        });
      }
      await supabase.from('beds').insert(bedsToInsert);
      await addActivityLog({
        module: 'Rooms',
        action: 'Room Added',
        details: `Room ${normalizedRoomNumber} (${typeValue}) added with ${capacity} bed(s), rent Rs ${rent}/bed`,
        actor: 'admin',
        level: 'info',
      });
    }

    revalidatePath('/rooms');
    revalidatePath('/');
  }

  async function deleteRoom(formData: FormData) {
    'use server';
    const room_id = formData.get('room_id') as string;

    const { data: bedsInRoom } = await supabase.from('beds').select('id').eq('room_id', room_id);

    if (bedsInRoom && bedsInRoom.length > 0) {
      const bedIds = bedsInRoom.map((bed) => bed.id);
      const { data: activeStudentsInRoom } = await supabase
        .from('student_admissions')
        .select('id')
        .in('bed_id', bedIds)
        .eq('status', 'ACTIVE')
        .limit(1);
      if (activeStudentsInRoom && activeStudentsInRoom.length > 0) {
        await addActivityLog({
          module: 'Rooms',
          action: 'Room Delete Blocked',
          details: `Room ID ${room_id} delete blocked because active residents exist`,
          actor: 'admin',
          level: 'warning',
        });
        redirect('/rooms?error=room_has_students');
      }

      await supabase.from('student_admissions').update({ bed_id: null, room_number: null, bed_number: null }).in('bed_id', bedIds);
      await supabase.from('students').update({ bed_id: null }).in('bed_id', bedIds);
      const { error: deleteBedsError } = await supabase.from('beds').delete().eq('room_id', room_id);
      if (deleteBedsError) {
        console.error('DELETE BEDS ERROR:', deleteBedsError.message);
        return;
      }
    }

    const { error: deleteRoomError } = await supabase.from('rooms').delete().eq('id', room_id);
    if (deleteRoomError) {
      console.error('DELETE ROOM ERROR:', deleteRoomError.message);
      return;
    }
    await addActivityLog({
      module: 'Rooms',
      action: 'Room Deleted',
      details: `Room ID ${room_id} and related empty beds deleted`,
      actor: 'admin',
      level: 'critical',
    });
    revalidatePath('/rooms');
    revalidatePath('/');
  }

  async function deleteSingleBed(formData: FormData) {
    'use server';
    const bed_id = formData.get('bed_id') as string;
    const { data: bedRow } = await supabase.from('beds').select('bed_number').eq('id', bed_id).single();

    await supabase.from('student_admissions').update({ bed_id: null, room_number: null, bed_number: null }).eq('bed_id', bed_id);
    await supabase.from('students').update({ bed_id: null }).eq('bed_id', bed_id);
    const { error: deleteBedError } = await supabase.from('beds').delete().eq('id', bed_id);
    if (deleteBedError) {
      console.error('DELETE SINGLE BED ERROR:', deleteBedError.message);
      return;
    }
    await addActivityLog({
      module: 'Rooms',
      action: 'Bed Deleted',
      details: `${bedRow?.bed_number || `Bed #${bed_id}`} removed`,
      actor: 'admin',
      level: 'warning',
    });

    revalidatePath('/rooms');
    revalidatePath('/');
  }

  return (
    <main className="flex-1 p-8 lg:p-12 overflow-y-auto overflow-x-hidden bg-[#F8FAFC] h-full font-sans relative">
      <ClearQueryOnce shouldClear={roomNumberDuplicate} delayMs={6000} />
      <div className="absolute top-0 left-0 w-full h-96 overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-200/40 rounded-full blur-3xl mix-blend-multiply opacity-70"></div>
      </div>

      <header className="mb-10 flex justify-between items-end relative z-10">
        <div>
          <h2 className="text-4xl font-black text-slate-800 tracking-tight">Bed Allocation Map</h2>
          <p className="text-slate-500 mt-2 font-medium">Manage rooms floor-wise and inspect occupancy quickly.</p>
          {roomDeleteBlocked && (
            <p className="mt-3 inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
              Remove the student first so the bed becomes vacant. Only then the room can be destroyed.
            </p>
          )}
        </div>

        <div className="flex gap-4">
          <div className="bg-white px-6 py-4 rounded-3xl shadow-sm border border-emerald-100 text-center">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Capacity</p>
            <p className="text-2xl font-black text-slate-700">
              {totalBeds} <span className="text-sm text-slate-400 font-medium">Beds</span>
            </p>
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
            <h3 className="text-xl font-black text-slate-800 border-b border-slate-100 pb-4 mb-6">Generate New Room</h3>

            <form action={addRoom} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Room Number</label>
                <input
                  type="text"
                  name="room_number"
                  required
                  placeholder="e.g. 101"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
                {roomNumberDuplicate && (
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-amber-700 shadow-sm">
                    Room number already exists on this floor. Please provide another room number.
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Floor</label>
                  <select name="floor" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="Ground">Ground</option>
                    {Array.from({ length: 15 }, (_, i) => i + 1).map((floorNo) => {
                      const floorLabel = getOrdinalFloorLabel(floorNo);
                      return (
                        <option key={floorLabel} value={floorLabel}>
                          {floorLabel}
                        </option>
                      );
                    })}
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
                  <input
                    type="number"
                    name="rent"
                    required
                    placeholder="6000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>

              <button type="submit" className="mt-4 w-full bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-indigo-700 transition-colors shadow-md">
                Build Room and Beds
              </button>
            </form>
          </div>
        </div>

        <FloorWiseRoomMap
          rooms={rooms || []}
          onDeleteRoom={deleteRoom}
          onDeleteBed={deleteSingleBed}
          highlightFloor={duplicateFloor}
          highlightRoomNumber={duplicateRoomNumber}
        />
      </div>
    </main>
  );
}
