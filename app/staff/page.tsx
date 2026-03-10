export const dynamic = 'force-dynamic';

import { revalidatePath } from 'next/cache';
import { supabase } from '../../lib/supabase';
import {
  addStaffSalaryPayment,
  getStaffMetaMap,
  getStaffSalaryPayments,
  upsertStaffMeta,
} from '../../lib/staff-payroll-cache';
import { addActivityLog } from '../../lib/activity-log-cache';

type StaffMember = {
  id: number;
  name: string;
  role: string;
  phone: string | null;
  salary: number | string | null;
  status: string | null;
  created_at?: string | null;
};

function monthKeyFromDate(date: Date) {
  return date.toISOString().slice(0, 7);
}

function formatDisplayDate(dateValue?: string | null) {
  if (!dateValue) return 'N/A';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDisplayDateTime(dateValue?: string | null) {
  if (!dateValue) return 'Not paid';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Not paid';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function StaffPage() {
  const today = new Date();
  const currentMonthKey = monthKeyFromDate(today);

  const { data: staffMembersRaw } = await supabase
    .from('staff')
    .select('*')
    .order('status', { ascending: true })
    .order('role', { ascending: true });

  const staffMembers = (staffMembersRaw || []) as StaffMember[];
  const staffIds = staffMembers.map((row) => Number(row.id));
  const metaMap = await getStaffMetaMap(staffIds);
  const allPayments = await getStaffSalaryPayments(staffIds);

  const currentMonthPayments = allPayments.filter((row) => row.month_key === currentMonthKey);
  const paidByStaffId = currentMonthPayments.reduce((acc, row) => {
    acc[row.staff_id] = Number((acc[row.staff_id] || 0) + Number(row.amount || 0));
    return acc;
  }, {} as Record<number, number>);

  const latestPaymentByStaffId = currentMonthPayments.reduce((acc, row) => {
    const existing = acc[row.staff_id];
    if (!existing || new Date(row.paid_at).getTime() > new Date(existing.paid_at).getTime()) {
      acc[row.staff_id] = { paid_at: row.paid_at, mode: row.mode };
    }
    return acc;
  }, {} as Record<number, { paid_at: string; mode: string }>);

  const activeStaff = staffMembers.filter((row) => (row.status || 'Active') === 'Active');
  const totalMonthlyPayroll = activeStaff.reduce((sum, row) => sum + Number(row.salary || 0), 0);

  const totalPaidThisMonth = activeStaff.reduce((sum, row) => {
    const staffId = Number(row.id);
    return sum + Number(paidByStaffId[staffId] || 0);
  }, 0);

  const totalDueThisMonth = activeStaff.reduce((sum, row) => {
    const staffId = Number(row.id);
    const salary = Number(row.salary || 0);
    const paid = Number(paidByStaffId[staffId] || 0);
    return sum + Math.max(0, salary - paid);
  }, 0);

  async function hireStaff(formData: FormData) {
    'use server';
    const name = ((formData.get('name') as string) || '').trim();
    const role = ((formData.get('role') as string) || '').trim();
    const phone = ((formData.get('phone') as string) || '').trim();
    const salary = Number(formData.get('salary') || 0);
    const joinedDate = ((formData.get('joined_date') as string) || '').trim() || new Date().toISOString().slice(0, 10);

    if (!name || !role || !phone || !Number.isFinite(salary) || salary <= 0) return;

    const { data: insertedStaff } = await supabase
      .from('staff')
      .insert([{ name, role, phone, salary }])
      .select('id')
      .single();

    if (insertedStaff?.id) {
      await upsertStaffMeta(Number(insertedStaff.id), { joined_date: joinedDate, left_date: null });
      await addActivityLog({
        module: 'Staff',
        action: 'Staff Hired',
        details: `${name} (${role}) added with salary Rs ${salary}`,
        actor: 'admin',
        level: 'info',
      });
    }

    revalidatePath('/staff');
  }

  async function deactivateStaff(formData: FormData) {
    'use server';
    const id = Number(formData.get('staff_id') || 0);
    if (!id) return;

    await supabase.from('staff').update({ status: 'Inactive' }).eq('id', id);
    await upsertStaffMeta(id, { left_date: new Date().toISOString().slice(0, 10) });
    await addActivityLog({
      module: 'Staff',
      action: 'Staff Deactivated',
      details: `Staff ID ${id} marked inactive`,
      actor: 'admin',
      level: 'warning',
    });
    revalidatePath('/staff');
  }

  async function markSalaryPaid(formData: FormData) {
    'use server';
    const staffId = Number(formData.get('staff_id') || 0);
    const salary = Number(formData.get('salary') || 0);
    const paidAmount = Number(formData.get('paid_amount') || 0);
    const mode = (formData.get('payment_mode') as 'Cash' | 'Bank Transfer' | 'UPI') || 'Cash';

    if (!staffId || !Number.isFinite(salary) || salary <= 0) return;
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) return;

    const amountToRecord = Number(Math.min(salary, paidAmount).toFixed(2));
    await addStaffSalaryPayment({
      staff_id: staffId,
      month_key: monthKeyFromDate(new Date()),
      amount: amountToRecord,
      mode,
      paid_at: new Date().toISOString(),
    });
    await addActivityLog({
      module: 'Staff',
      action: 'Salary Paid',
      details: `Staff ID ${staffId}: Rs ${amountToRecord} via ${mode}`,
      actor: 'admin',
      level: 'info',
    });

    revalidatePath('/staff');
  }

  return (
    <main className="flex-1 p-6 lg:p-8 overflow-y-auto bg-gray-50 h-full font-sans">
      <header className="mb-8 flex flex-wrap gap-3 justify-between items-end">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Staff and Payroll</h2>
          <p className="text-gray-500 mt-1">Track joining, leaving, salary payment, and dues month-wise.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white px-5 py-4 rounded-xl shadow-sm border border-indigo-100 text-right min-w-[170px]">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Monthly Payroll</p>
            <p className="text-2xl font-extrabold text-indigo-600">Rs {totalMonthlyPayroll.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-white px-5 py-4 rounded-xl shadow-sm border border-emerald-100 text-right min-w-[170px]">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Paid This Month</p>
            <p className="text-2xl font-extrabold text-emerald-600">Rs {totalPaidThisMonth.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-white px-5 py-4 rounded-xl shadow-sm border border-amber-100 text-right min-w-[170px]">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Due This Month</p>
            <p className="text-2xl font-extrabold text-amber-600">Rs {totalDueThisMonth.toLocaleString('en-IN')}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-1">
          <form action={hireStaff} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-5">
            <h3 className="text-xl font-bold text-gray-800 border-b border-gray-100 pb-3">Hire New Staff</h3>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Full Name</label>
              <input
                type="text"
                name="name"
                required
                placeholder="e.g. Ramesh Kumar"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Role / Designation</label>
              <select
                name="role"
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                <option value="Head Chef">Head Chef</option>
                <option value="Kitchen Helper">Kitchen Helper</option>
                <option value="Security Guard">Security Guard</option>
                <option value="Cleaning Staff">Cleaning Staff</option>
                <option value="Maintenance">Maintenance / Plumber</option>
                <option value="Hostel Warden">Hostel Warden</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Phone Number</label>
              <input
                type="text"
                name="phone"
                required
                placeholder="9876543210"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Monthly Salary (Rs)</label>
              <input
                type="number"
                min="1"
                name="salary"
                required
                placeholder="15000"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Joined Date</label>
              <input
                type="date"
                name="joined_date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <button
              type="submit"
              className="mt-2 w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Add to Payroll
            </button>
          </form>
        </div>

        <div className="xl:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">Staff Directory and Salary Tracker</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-white text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="p-4">Employee</th>
                    <th className="p-4">Joined / Left</th>
                    <th className="p-4">Salary</th>
                    <th className="p-4">Paid / Due (This Month)</th>
                    <th className="p-4">Last Paid</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm bg-white">
                  {staffMembers.map((staff) => {
                    const staffId = Number(staff.id);
                    const isActive = (staff.status || 'Active') === 'Active';
                    const salary = Number(staff.salary || 0);
                    const paid = Number(paidByStaffId[staffId] || 0);
                    const due = isActive ? Math.max(0, salary - paid) : 0;

                    const joinedDate = metaMap[staffId]?.joined_date || staff.created_at?.slice(0, 10) || null;
                    const leftDate = metaMap[staffId]?.left_date || null;

                    const paymentStatus = !isActive ? 'INACTIVE' : due <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING';
                    const paymentStatusClass =
                      paymentStatus === 'PAID'
                        ? 'bg-emerald-100 text-emerald-700'
                        : paymentStatus === 'PARTIAL'
                          ? 'bg-blue-100 text-blue-700'
                          : paymentStatus === 'PENDING'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-200 text-gray-600';

                    return (
                      <tr key={staffId} className={`hover:bg-gray-50/50 transition-colors ${!isActive ? 'opacity-70' : ''}`}>
                        <td className="p-4 align-top">
                          <p className="font-bold text-gray-900">{staff.name || 'Unnamed'}</p>
                          <p className="text-xs text-gray-500 mt-1">{staff.role || 'N/A'}</p>
                          <p className="text-xs text-gray-500">{staff.phone || 'N/A'}</p>
                        </td>

                        <td className="p-4 align-top">
                          <p className="text-xs text-gray-500">Joined</p>
                          <p className="font-semibold text-gray-800">{formatDisplayDate(joinedDate)}</p>
                          <p className="text-xs text-gray-500 mt-2">Left</p>
                          <p className="font-semibold text-gray-800">{formatDisplayDate(leftDate)}</p>
                        </td>

                        <td className="p-4 align-top">
                          <p className="font-extrabold text-indigo-600">Rs {salary.toLocaleString('en-IN')}</p>
                          <p className="text-xs text-gray-400 mt-1">per month</p>
                        </td>

                        <td className="p-4 align-top">
                          <p className="text-sm font-semibold text-emerald-700">Paid: Rs {paid.toLocaleString('en-IN')}</p>
                          <p className="text-sm font-semibold text-amber-700">Due: Rs {due.toLocaleString('en-IN')}</p>
                          <span className={`inline-block mt-2 text-[10px] uppercase font-extrabold px-2 py-1 rounded-full ${paymentStatusClass}`}>
                            {paymentStatus}
                          </span>
                        </td>

                        <td className="p-4 align-top">
                          <p className="text-xs text-gray-500">{formatDisplayDateTime(latestPaymentByStaffId[staffId]?.paid_at)}</p>
                          <p className="text-xs text-gray-500 mt-1">Mode: {latestPaymentByStaffId[staffId]?.mode || 'N/A'}</p>
                        </td>

                        <td className="p-4 align-top">
                          <div className="flex flex-col items-end gap-2">
                            {isActive && due > 0 && (
                              <form action={markSalaryPaid} className="flex items-center gap-2">
                                <input type="hidden" name="staff_id" value={staffId} />
                                <input type="hidden" name="salary" value={salary} />
                                <input
                                  type="number"
                                  name="paid_amount"
                                  min="1"
                                  max={due}
                                  defaultValue={due}
                                  className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                                <select
                                  name="payment_mode"
                                  className="border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-700 focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                >
                                  <option value="Cash">Cash</option>
                                  <option value="UPI">UPI</option>
                                  <option value="Bank Transfer">Bank Transfer</option>
                                </select>
                                <button
                                  type="submit"
                                  className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold py-2 px-3 rounded-lg transition-colors border border-emerald-200"
                                >
                                  Mark Paid
                                </button>
                              </form>
                            )}

                            {isActive ? (
                              <form action={deactivateStaff}>
                                <input type="hidden" name="staff_id" value={staffId} />
                                <button
                                  type="submit"
                                  className="text-xs bg-red-50 hover:bg-red-100 text-red-600 font-bold py-2 px-3 rounded-lg transition-colors border border-red-100"
                                >
                                  Deactivate
                                </button>
                              </form>
                            ) : (
                              <span className="text-xs text-gray-400 font-bold italic">Terminated</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {staffMembers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-gray-400 italic font-medium">
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
