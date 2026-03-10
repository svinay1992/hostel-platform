'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type StudentAdmission = {
  id: number;
  full_name: string | null;
  status: string | null;
};

type Bed = {
  id: number;
  bed_number: string;
  is_occupied: boolean | null;
  monthly_rent: number | null;
  student_admissions: StudentAdmission[] | StudentAdmission | null;
};

type Room = {
  id: number;
  room_number: string;
  capacity: number | null;
  total_capacity: number | null;
  type: string | null;
  room_type: string | null;
  floor: string | null;
  beds: Bed[] | null;
};

type SearchSuggestion = {
  key: string;
  roomId: number;
  roomNumber: string;
  floor: string;
  bedNumber: string;
  studentName: string;
};

type FloorWiseRoomMapProps = {
  rooms: Room[];
  onDeleteRoom: (formData: FormData) => void | Promise<void>;
  onDeleteBed: (formData: FormData) => void | Promise<void>;
  highlightFloor?: string | null;
  highlightRoomNumber?: string | null;
};

function getFloorRank(floor: string) {
  const lower = floor.toLowerCase();
  if (lower.includes('ground')) return 0;
  const match = lower.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);
  return 99;
}

function toAdmissions(value: Bed['student_admissions']): StudentAdmission[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];
  return [];
}

function getRoomOccupancy(room: Room) {
  const beds = room.beds || [];
  const occupied = beds.filter((bed) => {
    const active = toAdmissions(bed.student_admissions).some((admission) => admission.status === 'ACTIVE');
    return active;
  }).length;

  return {
    occupied,
    total: beds.length,
    vacant: Math.max(beds.length - occupied, 0),
  };
}

function getRoomNumberStateClasses(occupied: number, total: number) {
  if (total === 0 || occupied === 0) {
    return 'text-emerald-600';
  }
  if (occupied >= total) {
    return 'text-rose-600';
  }
  return 'text-orange-500';
}

export default function FloorWiseRoomMap({
  rooms,
  onDeleteRoom,
  onDeleteBed,
  highlightFloor,
  highlightRoomNumber,
}: FloorWiseRoomMapProps) {
  const [query, setQuery] = useState('');
  const [expandedFloors, setExpandedFloors] = useState<Record<string, boolean>>({});
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const roomButtonRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const [popupPlacement, setPopupPlacement] = useState<Record<number, 'left' | 'right'>>({});

  const grouped = useMemo(() => {
    const map = new Map<string, Room[]>();
    for (const room of rooms) {
      const floorName = room.floor || 'Unassigned';
      const existing = map.get(floorName) || [];
      existing.push(room);
      map.set(floorName, existing);
    }

    return Array.from(map.entries())
      .map(([floor, floorRooms]) => ({
        floor,
        rooms: floorRooms.sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true })),
      }))
      .sort((a, b) => getFloorRank(a.floor) - getFloorRank(b.floor));
  }, [rooms]);

  const normalizedQuery = query.trim().toLowerCase();
  const hasSearch = normalizedQuery.length > 0;

  const searchSuggestions = useMemo(() => {
    if (!hasSearch) return [];

    const suggestions: SearchSuggestion[] = [];
    for (const room of rooms) {
      const floor = room.floor || 'Unassigned';
      for (const bed of room.beds || []) {
        for (const admission of toAdmissions(bed.student_admissions)) {
          if (admission.status !== 'ACTIVE') continue;
          const studentName = (admission.full_name || '').trim();
          const bedNumber = bed.bed_number || '';
          const roomNumber = room.room_number || '';
          const haystack = `${studentName} ${bedNumber} ${roomNumber}`.toLowerCase();
          if (!haystack.includes(normalizedQuery)) continue;
          suggestions.push({
            key: `${room.id}-${bed.id}-${admission.id}`,
            roomId: room.id,
            roomNumber,
            floor,
            bedNumber,
            studentName: studentName || 'Student',
          });
        }
      }
    }

    return suggestions.slice(0, 8);
  }, [hasSearch, normalizedQuery, rooms]);

  const floorsWithFilteredRooms = useMemo(() => {
    return grouped.map((floorGroup) => {
      if (!hasSearch) return floorGroup;

      const filteredRooms = floorGroup.rooms.filter((room) => {
        if ((room.room_number || '').toLowerCase().includes(normalizedQuery)) return true;

        const beds = room.beds || [];
        return beds.some((bed) => {
          const bedMatch = (bed.bed_number || '').toLowerCase().includes(normalizedQuery);
          const studentMatch = toAdmissions(bed.student_admissions).some((admission) =>
            (admission.full_name || '').toLowerCase().includes(normalizedQuery)
          );
          return bedMatch || studentMatch;
        });
      });

      return { ...floorGroup, rooms: filteredRooms };
    });
  }, [grouped, hasSearch, normalizedQuery]);

  const totalMatches = floorsWithFilteredRooms.reduce((sum, floorGroup) => sum + floorGroup.rooms.length, 0);

  const focusRoom = (suggestion: SearchSuggestion) => {
    setExpandedFloors((prev) => ({ ...prev, [suggestion.floor]: true }));
    setActiveRoomId(suggestion.roomId);

    window.setTimeout(() => {
      const btn = roomButtonRefs.current[suggestion.roomId];
      if (btn) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        btn.focus();
      }
    }, 80);
  };

  const measurePopupPlacement = (roomId: number, preferred: 'left' | 'right' = 'right') => {
    const btn = roomButtonRefs.current[roomId];
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const popupWidth = window.innerWidth < 640 ? 320 : 352; // 20rem / 22rem
    const gap = 16;
    const fitsRight = rect.right + popupWidth + gap <= window.innerWidth;
    const fitsLeft = rect.left - popupWidth - gap >= 0;
    let placement: 'left' | 'right' = preferred;
    if (preferred === 'right' && !fitsRight && fitsLeft) placement = 'left';
    if (preferred === 'left' && !fitsLeft && fitsRight) placement = 'right';
    if (!fitsLeft && !fitsRight) placement = 'right';
    setPopupPlacement((prev) => (prev[roomId] === placement ? prev : { ...prev, [roomId]: placement }));
  };

  useEffect(() => {
    if (!highlightFloor || !highlightRoomNumber) return;
    const target = rooms.find(
      (room) =>
        (room.floor || '').toLowerCase() === highlightFloor.toLowerCase() &&
        (room.room_number || '').toLowerCase() === highlightRoomNumber.toLowerCase()
    );
    if (!target) return;
    setExpandedFloors((prev) => ({ ...prev, [target.floor || 'Unassigned']: true }));
    setActiveRoomId(target.id);
    window.setTimeout(() => {
      const btn = roomButtonRefs.current[target.id];
      if (btn) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        btn.focus();
        measurePopupPlacement(target.id, 'right');
      }
    }, 120);
  }, [highlightFloor, highlightRoomNumber, rooms]);

  if (!rooms || rooms.length === 0) {
    return (
      <div className="col-span-full p-12 text-center bg-white rounded-3xl border border-dashed border-slate-300 shadow-sm">
        <span className="text-4xl">Rooms</span>
        <p className="text-slate-500 font-medium mt-4">Your hostel has no rooms yet.</p>
      </div>
    );
  }

  return (
    <div className="xl:col-span-3 space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start gap-3">
          <div className="flex-1 relative">
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Room Finder</p>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="text"
              placeholder="Search by student name, bed number, or room number..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            {hasSearch && searchSuggestions.length > 0 && (
              <div className="absolute z-50 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                {searchSuggestions.map((result) => (
                  <button
                    key={result.key}
                    type="button"
                    onClick={() => focusRoom(result)}
                    className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors border-b border-slate-100 last:border-b-0"
                  >
                    <p className="text-sm font-black text-slate-800">{result.studentName}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Room {result.roomNumber} • {result.bedNumber} • {result.floor}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="md:w-56 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Search Result</p>
            <p className="text-lg font-black text-slate-700 leading-tight">{hasSearch ? totalMatches : rooms.length} Rooms</p>
          </div>
        </div>
      </div>

      {floorsWithFilteredRooms.map((floorGroup) => {
        const floorRooms = floorGroup.rooms;
        const isExpanded = hasSearch ? true : Boolean(expandedFloors[floorGroup.floor]);

        const totalBeds = floorRooms.reduce((sum, room) => sum + (room.beds?.length || 0), 0);
        const occupiedBeds = floorRooms.reduce((sum, room) => sum + getRoomOccupancy(room).occupied, 0);

        return (
          <section key={floorGroup.floor} className="relative bg-white rounded-3xl border border-slate-200 shadow-sm overflow-visible">
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/60 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-slate-900">{floorGroup.floor}</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                  {floorRooms.length} Rooms - {occupiedBeds}/{totalBeds} Beds Occupied
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setExpandedFloors((prev) => ({
                    ...prev,
                    [floorGroup.floor]: !prev[floorGroup.floor],
                  }))
                }
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-700 hover:border-indigo-200 hover:text-indigo-600 transition-colors"
              >
                {isExpanded ? 'Collapse Rooms' : 'Expand Rooms'}
              </button>
            </div>

            {isExpanded && (
              <div className="p-6 overflow-visible">
                {floorRooms.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {floorRooms.map((room) => {
                      const displayType = room.room_type || room.type || 'Standard';
                      const roomOcc = getRoomOccupancy(room);
                      const isPinnedOpen = activeRoomId === room.id;
                      const roomStateColor = getRoomNumberStateClasses(roomOcc.occupied, roomOcc.total);

                      const isHighlighted =
                        highlightFloor &&
                        highlightRoomNumber &&
                        (room.floor || '').toLowerCase() === highlightFloor.toLowerCase() &&
                        (room.room_number || '').toLowerCase() === highlightRoomNumber.toLowerCase();

                      return (
                        <div key={room.id} className="relative group hover:z-40">
                          <button
                            ref={(el) => {
                              roomButtonRefs.current[room.id] = el;
                            }}
                            type="button"
                            onClick={() => setActiveRoomId((current) => (current === room.id ? null : room.id))}
                            onMouseEnter={() => measurePopupPlacement(room.id, 'right')}
                            className={`min-h-[3.2rem] min-w-[3.8rem] rounded-xl border bg-white px-3 py-2 transition-colors ${
                              isPinnedOpen
                                ? 'border-indigo-400 ring-2 ring-indigo-200'
                                : isHighlighted
                                  ? 'border-amber-400 ring-2 ring-amber-200 bg-amber-50/60'
                                : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50'
                            }`}
                          >
                            <div className="flex flex-col items-center justify-center gap-1">
                              <span className={`text-base font-black leading-none ${roomStateColor}`}>{room.room_number}</span>
                              <span className="flex items-center justify-center gap-1">
                                {Array.from({ length: Math.max(roomOcc.total, 0) }).map((_, index) => (
                                  <span
                                    key={`room-${room.id}-dot-${index}`}
                                    className="h-1.5 w-1.5 rounded-full bg-indigo-500/90"
                                    aria-hidden="true"
                                  />
                                ))}
                              </span>
                            </div>
                          </button>

                          <div
                            className={`absolute top-12 z-50 w-[20rem] sm:w-[22rem] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-300/40 transition-opacity ${
                              isPinnedOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'
                            } ${popupPlacement[room.id] === 'left' ? 'right-0' : 'left-0'}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-lg font-black text-slate-900">Room {room.room_number}</p>
                                <p className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mt-1">{displayType}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                  {roomOcc.occupied}/{roomOcc.total} Occupied
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setActiveRoomId(null)}
                                  className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700"
                                >
                                  Close
                                </button>
                              </div>
                            </div>

                            <div className="mt-3 space-y-2 max-h-44 overflow-y-auto pr-1">
                              {(room.beds || []).map((bed) => {
                                const active = toAdmissions(bed.student_admissions).find((admission) => admission.status === 'ACTIVE');
                                const occupied = Boolean(active);
                                return (
                                  <div key={bed.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-xs font-black text-slate-700">{bed.bed_number}</p>
                                      <span
                                        className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                                          occupied ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-700'
                                        }`}
                                      >
                                        {occupied ? 'Occupied' : 'Vacant'}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-1 truncate">{active?.full_name || 'No student assigned'}</p>

                                    <form action={onDeleteBed} className="mt-2 flex justify-end">
                                      <input type="hidden" name="bed_id" value={bed.id} />
                                      <button
                                        type="submit"
                                        className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-rose-200 hover:text-rose-600 transition-colors"
                                      >
                                        Remove Bed
                                      </button>
                                    </form>
                                  </div>
                                );
                              })}
                            </div>

                            <form action={onDeleteRoom} className="mt-3 flex justify-end">
                              <input type="hidden" name="room_id" value={room.id} />
                              <button
                                type="submit"
                                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-rose-600 hover:bg-rose-100 transition-colors"
                              >
                                Destroy Room
                              </button>
                            </form>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">No matching rooms on this floor.</p>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
