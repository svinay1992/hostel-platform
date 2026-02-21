// Cache Buster
export const dynamic = 'force-dynamic';

import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';

export default async function StaffPage() {
  
  // 1. Fetch all staff members safely
  const { data: staffMembers } = await supabase
    .from('staff')
    .select('*')
    .order('status', { ascending: true }) // Active first
    .order('role', { ascending: true });

  // Calculate total monthly payroll for Active staff
  const activeStaff = staffMembers?.filter((s: any) => s.status === 'Active') || [];
  const totalPayroll = activeStaff.reduce((sum: number, s: any) => sum + Number(s.salary), 0);

  // 2. SERVER ACTION: Hire new staff
  async function hireStaff(formData: FormData) {
    'use server';
    const name = formData.get('name') as string;
    const role = formData.get('role') as string;
    const phone = formData.get('phone') as string;
    const salary = parseFloat(formData.get('salary') as string);

    await supabase.from('staff').insert([{ name, role, phone, salary }]);
    revalidatePath('/staff');
  }

  // 3. SERVER ACTION: Let a staff member go (Mark as Inactive)
  async function deactivateStaff(formData: FormData) {
    'use server';
    const id = formData.get('staff_id') as string;
    await supabase.from('staff').update({ status: 'Inactive' }).eq('id', id);
    revalidatePath('/staff');
  }

  return (
    <main className="flex-1 p-10 overflow-y-auto bg-gray-50 h-full font-sans">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">👨‍🍳 Staff & Payroll</h2>
          <p className="text-gray-500 mt-1">Manage hostel employees and monthly salary expenses.</p>
        </div>
        <div className="bg-white px-6 py-4 rounded-xl shadow-sm border border-indigo-100 text-right">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Monthly Payroll</p>
          <p className="text-2xl font-extrabold text-indigo-600">₹{totalPayroll.toLocaleString('en-IN')}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: Hiring Form */}
        <div className="xl:col-span-1">
          <form action={hireStaff} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-5 sticky top-10">
            <h3 className="text-xl font-bold text-gray-800 border-b border-gray-100 pb-3">Hire New Staff</h3>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Full Name</label>
              <input type="text" name="name" required placeholder="e.g. Ramesh Kumar" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Role / Designation</label>
              <select name="role" required className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                <option value="Head Chef">🍳 Head Chef</option>
                <option value="Kitchen Helper">🥘 Kitchen Helper</option>
                <option value="Security Guard">🛡️ Security Guard</option>
                <option value="Cleaning Staff">🧹 Cleaning Staff</option>
                <option value="Maintenance">🔧 Maintenance / Plumber</option>
                <option value="Hostel Warden">👔 Hostel Warden</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Phone Number</label>
              <input type="text" name="phone" required placeholder="9876543210" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Monthly Salary (₹)</label>
              <input type="number" name="salary" required placeholder="15000" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>

            <button type="submit" className="mt-2 w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
              Add to Payroll
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: Staff Directory */}
        <div className="xl:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">Staff Directory</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-white text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="p-5">Employee Details</th>
                    <th className="p-5">Contact</th>
                    <th className="p-5">Salary</th>
                    <th className="p-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm bg-white">
                  {staffMembers?.map((staff: any) => {
                    const isActive = staff.status === 'Active';

                    return (
                      <tr key={staff.id} className={`hover:bg-gray-50/50 transition-colors ${!isActive ? 'opacity-50 grayscale' : ''}`}>
                        <td className="p-5">
                          <p className="font-bold text-gray-900">{staff.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500 font-medium">{staff.role}</span>
                            <span className={`text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                              {staff.status}
                            </span>
                          </div>
                        </td>
                        
                        <td className="p-5 text-gray-600 font-medium">
                          {staff.phone || 'N/A'}
                        </td>

                        <td className="p-5">
                          <p className="font-extrabold text-indigo-600">₹{Number(staff.salary).toLocaleString('en-IN')}</p>
                          <p className="text-xs text-gray-400 mt-1">/ month</p>
                        </td>

                        <td className="p-5 text-right">
                          {isActive ? (
                            <form action={deactivateStaff}>
                              <input type="hidden" name="staff_id" value={staff.id} />
                              <button type="submit" className="text-xs bg-red-50 hover:bg-red-100 text-red-600 font-bold py-2 px-3 rounded-lg transition-colors border border-red-100">
                                Deactivate
                              </button>
                            </form>
                          ) : (
                            <span className="text-xs text-gray-400 font-bold italic">Terminated</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {(!staffMembers || staffMembers.length === 0) && (
                    <tr>
                      <td colSpan={4} className="p-10 text-center text-gray-400 italic font-medium">
                        No staff members hired yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}