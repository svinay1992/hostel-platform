import { supabase } from '../../lib/supabase';

export default async function RoomsPage() {
  
  // 1. Fetch Rooms and their nested Beds
  // The syntax `*, beds(*)` is a powerful relational query in Supabase
  const { data: rooms, error } = await supabase
    .from('rooms')
    .select(`
      *,
      beds (*)
    `)
    .order('room_number', { ascending: true });

  if (error) {
    console.error("Error fetching rooms:", error);
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      
      

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-10 overflow-y-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-800">Bed Allocation Map</h2>
            <p className="text-gray-500 mt-1">Live overview of hostel occupancy.</p>
          </div>
          <button className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors">
            + Add New Room
          </button>
        </header>

        {/* 2. THE VISUAL ROOM GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {rooms?.map((room: any) => (
            <div key={room.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              
              {/* Room Header */}
              <div className="bg-gray-50 p-4 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">Room {room.room_number}</h3>
                  <p className="text-xs text-gray-500 font-medium">{room.room_type} • Floor {room.floor}</p>
                </div>
                <span className="text-sm font-bold text-gray-400">
                  Capacity: {room.total_capacity}
                </span>
              </div>

              {/* Beds Inside the Room */}
              <div className="p-4 flex flex-col gap-3">
                {room.beds?.sort((a: any, b: any) => a.bed_number.localeCompare(b.bed_number)).map((bed: any) => (
                  <div 
                    key={bed.id} 
                    className={`flex justify-between items-center p-3 rounded-lg border ${
                      bed.is_occupied 
                        ? 'bg-red-50 border-red-100' 
                        : 'bg-green-50 border-green-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${bed.is_occupied ? 'bg-red-500' : 'bg-green-500'}`}></div>
                      <span className="font-semibold text-gray-700 text-sm">Bed {bed.bed_number}</span>
                    </div>
                    
                    <span className={`text-xs font-bold px-2 py-1 rounded-md ${
                      bed.is_occupied ? 'text-red-700 bg-red-100' : 'text-green-700 bg-green-100'
                    }`}>
                      {bed.is_occupied ? 'Occupied' : 'Vacant'}
                    </span>
                  </div>
                ))}
              </div>

            </div>
          ))}

        </div>
      </main>
    </div>
  );
}