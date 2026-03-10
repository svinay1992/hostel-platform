// Cache buster
export const dynamic = 'force-dynamic';

import { supabase } from '../../lib/supabase';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import PrintCardButton from '../_components/print-card-button';
import {
  getStudentElectricityMap,
  removeStudentElectricityData,
  setStudentElectricityData
} from '../../lib/student-electricity-cache';
import {
  getStudentMaintenanceMap,
  removeStudentMaintenanceData,
  setStudentMaintenanceData
} from '../../lib/student-maintenance-cache';
import { addActivityLog } from '../../lib/activity-log-cache';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidIndianPhone(phone: string) {
  return /^[6-9]\d{9}$/.test(phone);
}

function isReasonableDateOfBirth(value: string) {
  const dob = new Date(value);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  const ageYears = (now.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return ageYears >= 12 && ageYears <= 60;
}

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ view?: string, add?: string, qr?: string, error?: string }> }) {
  
  const resolvedParams = await searchParams;
  const viewId = resolvedParams?.view;
  const qrId = resolvedParams?.qr;
  const showAddForm = resolvedParams?.add === 'true';
  const addError = (resolvedParams?.error || '').toLowerCase();
  const studentError = (resolvedParams?.error || '').toLowerCase();

  // 1. FETCH FROM THE NEW CHATGPT TABLE
  const { data: students } = await supabase
    .from('student_admissions')
    .select('*')
    .order('created_at', { ascending: false });
  const studentElectricityMap = await getStudentElectricityMap(
    (students || []).map((student: any) => Number(student.id)).filter((id: number) => Number.isFinite(id))
  );
  const studentMaintenanceMap = await getStudentMaintenanceMap(
    (students || []).map((student: any) => Number(student.id)).filter((id: number) => Number.isFinite(id))
  );
  const studentsWithElectricity = (students || []).map((student: any) => {
    const cached = studentElectricityMap[Number(student.id)];
    const units = Number(student.electricity_units ?? 0);
    const rate = Number(student.electricity_rate_per_unit ?? 0);
    const maintenanceCached = studentMaintenanceMap[Number(student.id)];
    const maintenanceDeposit = Number(student.maintenance_deposit ?? 0);
    const maintenanceDepositDate = student.maintenance_deposit_date ?? null;

    return {
      ...student,
      electricity_units: units > 0 ? units : Number(cached?.units ?? 0),
      electricity_rate_per_unit: rate > 0 ? rate : Number(cached?.ratePerUnit ?? 0),
      maintenance_deposit: maintenanceDeposit > 0 ? maintenanceDeposit : Number(maintenanceCached?.deposit ?? 0),
      maintenance_deposit_date: maintenanceDepositDate || maintenanceCached?.depositDate || null,
    };
  });

  // 2. FETCH VACANT BEDS (For the dropdown)
  const { data: bedsWithAdmissions } = await supabase
    .from('beds')
    .select('id, bed_number, rooms(room_number), student_admissions ( id, status )')
    .order('bed_number', { ascending: true });

  const vacantBeds = (bedsWithAdmissions || []).filter((bed: any) => {
    const admissions = Array.isArray(bed.student_admissions) ? bed.student_admissions : [];
    return !admissions.some((student: any) => student.status === 'ACTIVE');
  });
  const bedsById = new Map((bedsWithAdmissions || []).map((bed: any) => [Number(bed.id), bed]));

  const activeStudents = studentsWithElectricity.filter((s: any) => s.status === 'ACTIVE');
  const leftStudents = studentsWithElectricity.filter((s: any) => s.status === 'LEFT');

  // 3. SERVER ACTION: Complete Admission
  async function admitStudent(formData: FormData) {
    'use server';
    
    // Extracting strict required fields
    const full_name = ((formData.get('full_name') as string) || '').trim();
    const email = ((formData.get('email') as string) || '').trim().toLowerCase();
    const phone = ((formData.get('phone') as string) || '').replace(/\D+/g, '');
    const date_of_birth = (formData.get('date_of_birth') as string) || '';
    const home_address = ((formData.get('home_address') as string) || '').trim();
    const parent_name = ((formData.get('parent_name') as string) || '').trim();
    const parent_phone = ((formData.get('parent_phone') as string) || '').replace(/\D+/g, '');

    if (!full_name || full_name.length < 3 || !/^[A-Za-z ]+$/.test(full_name)) {
      return redirect('/students?add=true&error=invalid_name');
    }
    if (!email || !isValidEmail(email)) {
      return redirect('/students?add=true&error=invalid_email');
    }
    if (!isValidIndianPhone(phone)) {
      return redirect('/students?add=true&error=invalid_phone');
    }
    if (!date_of_birth || !isReasonableDateOfBirth(date_of_birth)) {
      return redirect('/students?add=true&error=invalid_dob');
    }
    if (!home_address || home_address.length < 10) {
      return redirect('/students?add=true&error=invalid_address');
    }
    if (!parent_name || parent_name.length < 3 || !/^[A-Za-z ]+$/.test(parent_name)) {
      return redirect('/students?add=true&error=invalid_parent_name');
    }
    if (!isValidIndianPhone(parent_phone)) {
      return redirect('/students?add=true&error=invalid_parent_phone');
    }

    const { data: existingAdmissionByEmail } = await supabase
      .from('student_admissions')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existingAdmissionByEmail?.id) {
      return redirect('/students?add=true&error=email_used');
    }
    
    // Optional & Enum fields
    const blood_group = formData.get('blood_group') as string;
    const coaching_name = ((formData.get('coaching_name') as string) || '').trim();
    const course = ((formData.get('course') as string) || '').trim();
    const timing = ((formData.get('timing') as string) || '').trim();
    const food_preference = formData.get('food_preference') as string;
    if (coaching_name.length > 0 && coaching_name.length < 2) {
      return redirect('/students?add=true&error=invalid_coaching');
    }
    if (timing.length > 0 && timing.length < 3) {
      return redirect('/students?add=true&error=invalid_timing');
    }

    // Financial Data
    const security_deposit = Number((formData.get('security_deposit') as string) || 0);
    const sd_date = formData.get('deposit_date') as string;
    const deposit_date = sd_date ? sd_date : null;
    
    const advance_rent = Number((formData.get('advance_rent') as string) || 0);
    const ar_date = formData.get('rent_date') as string;
    const rent_date = ar_date ? ar_date : null;
    const electricity_units = Number((formData.get('electricity_units') as string) || 0);
    const electricity_rate_per_unit = Number((formData.get('electricity_rate_per_unit') as string) || 0);
    const maintenance_deposit = Number((formData.get('maintenance_deposit') as string) || 0);
    const md_date = formData.get('maintenance_deposit_date') as string;
    const maintenance_deposit_date = md_date ? md_date : null;

    if (!Number.isFinite(security_deposit) || security_deposit < 0 || security_deposit > 5000000) {
      return redirect('/students?add=true&error=invalid_security_deposit');
    }
    if (!Number.isFinite(advance_rent) || advance_rent < 0 || advance_rent > 5000000) {
      return redirect('/students?add=true&error=invalid_advance_rent');
    }
    if (!Number.isFinite(electricity_units) || electricity_units < 0 || electricity_units > 100000) {
      return redirect('/students?add=true&error=invalid_electricity_units');
    }
    if (!Number.isFinite(electricity_rate_per_unit) || electricity_rate_per_unit < 0 || electricity_rate_per_unit > 10000) {
      return redirect('/students?add=true&error=invalid_electricity_rate');
    }
    if (!Number.isFinite(maintenance_deposit) || maintenance_deposit < 0 || maintenance_deposit > 5000000) {
      return redirect('/students?add=true&error=invalid_maintenance_deposit');
    }

    // Bed Allocation Logic
    const bed_id_raw = formData.get('bed_id') as string;
    let bed_id = null;
    let room_number = null;
    let bed_number = null;

    if (bed_id_raw !== 'unassigned') {
      bed_id = parseInt(bed_id_raw);
      if (!Number.isFinite(bed_id) || bed_id <= 0) {
        return redirect('/students?add=true&error=invalid_bed');
      }
      const { data: activeOccupant } = await supabase
        .from('student_admissions')
        .select('id')
        .eq('bed_id', bed_id)
        .eq('status', 'ACTIVE')
        .maybeSingle();
      if (activeOccupant) {
        console.error("BED ALREADY OCCUPIED:", bed_id);
        redirect('/students?add=true&error=bed_occupied');
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
      
      if (userError) return redirect('/students?add=true&error=user_create_failed');
      targetUserId = newUser.id;
    }

    // Insert directly into the new student table
    if (targetUserId) {
      const studentInsertPayload = {
        full_name, email, phone, date_of_birth, blood_group, home_address,
        parent_name, parent_phone, coaching_name, course, timing,
        food_preference, room_number, bed_number, bed_id,
        security_deposit, deposit_date, advance_rent, rent_date,
        electricity_units, electricity_rate_per_unit,
        maintenance_deposit, maintenance_deposit_date,
        status: 'ACTIVE'
      };

      let admittedStudentId: number | null = null;
      let studentError: { message: string } | null = null;

      const { data: insertedStudent, error: insertWithElectricityError } = await supabase
        .from('student_admissions')
        .insert([studentInsertPayload])
        .select('id')
        .single();

      studentError = (insertWithElectricityError as { message: string } | null) || null;
      admittedStudentId = insertedStudent?.id ? Number(insertedStudent.id) : null;

      if (
        studentError &&
        (
          studentError.message.includes('electricity_units') ||
          studentError.message.includes('electricity_rate_per_unit') ||
          studentError.message.includes('maintenance_deposit') ||
          studentError.message.includes('maintenance_deposit_date')
        )
      ) {
        const {
          electricity_units: _ignoreUnits,
          electricity_rate_per_unit: _ignoreRate,
          maintenance_deposit: _ignoreMaintenance,
          maintenance_deposit_date: _ignoreMaintenanceDate,
          ...legacyStudentInsertPayload
        } = studentInsertPayload;

        const { data: legacyInsertedStudent, error: legacyStudentAdmissionError } = await supabase
          .from('student_admissions')
          .insert([legacyStudentInsertPayload])
          .select('id')
          .single();

        studentError = (legacyStudentAdmissionError as { message: string } | null) || null;
        admittedStudentId = legacyInsertedStudent?.id ? Number(legacyInsertedStudent.id) : admittedStudentId;
      }

      if (!studentError && admittedStudentId) {
        await setStudentElectricityData(
          admittedStudentId,
          Number(electricity_units || 0),
          Number(electricity_rate_per_unit || 0)
        );
        await setStudentMaintenanceData(
          admittedStudentId,
          Number(maintenance_deposit || 0),
          maintenance_deposit_date
        );
      }

      if (studentError) {
        console.error("❌ INSERT ERROR:", studentError.message);
        if ((studentError.message || '').toLowerCase().includes('student_admissions_email_key')) {
          return redirect('/students?add=true&error=email_used');
        }
        return redirect('/students?add=true&error=admission_failed');
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
        await addActivityLog({
          module: 'Students',
          action: 'Student Admitted',
          details: `${full_name} admitted${room_number ? ` to Room ${room_number}` : ''}${bed_number ? ` / Bed ${bed_number}` : ''}`,
          actor: 'admin',
          level: 'info',
        });
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
    const { data: studentRow } = await supabase.from('student_admissions').select('full_name').eq('id', id).single();

    await supabase.from('student_admissions').update({ status: 'LEFT', bed_id: null, room_number: null, bed_number: null }).eq('id', id);
    await removeStudentElectricityData(Number(id));
    await removeStudentMaintenanceData(Number(id));
    if (bed_id) {
      await supabase.from('students').update({ bed_id: null }).eq('bed_id', bed_id);
      await supabase.from('beds').update({ is_occupied: false }).eq('id', bed_id);
    }
    await addActivityLog({
      module: 'Students',
      action: 'Student Move Out',
      details: `${studentRow?.full_name || `Student #${id}`} moved out and marked LEFT`,
      actor: 'admin',
      level: 'warning',
    });

    revalidatePath('/students');
    revalidatePath('/rooms');
    revalidatePath('/');
  }

  async function changeStudentBed(formData: FormData) {
    'use server';
    const studentId = Number(formData.get('student_id') || 0);
    const newBedId = Number(formData.get('new_bed_id') || 0);

    if (!studentId) return redirect('/students?error=bed_change_invalid_student');
    if (!newBedId || !Number.isFinite(newBedId) || newBedId <= 0) return redirect('/students?error=bed_change_invalid_bed');

    const { data: studentRow } = await supabase
      .from('student_admissions')
      .select('id, full_name, email, status, bed_id')
      .eq('id', studentId)
      .eq('status', 'ACTIVE')
      .single();
    if (!studentRow?.id) return redirect('/students?error=bed_change_invalid_student');

    const { data: targetBed } = await supabase
      .from('beds')
      .select('id, bed_number, rooms(room_number)')
      .eq('id', newBedId)
      .single();
    if (!targetBed?.id) return redirect('/students?error=bed_change_invalid_bed');

    const { data: occupiedByAnother } = await supabase
      .from('student_admissions')
      .select('id')
      .eq('bed_id', newBedId)
      .eq('status', 'ACTIVE')
      .neq('id', studentId)
      .maybeSingle();
    if (occupiedByAnother?.id) return redirect('/students?error=bed_change_occupied');

    const previousBedId = studentRow.bed_id ? Number(studentRow.bed_id) : null;
    const nextRoomNumber = (targetBed.rooms as any)?.room_number || null;
    const nextBedNumber = targetBed.bed_number || null;

    const { error: updateAdmissionError } = await supabase
      .from('student_admissions')
      .update({
        bed_id: newBedId,
        room_number: nextRoomNumber,
        bed_number: nextBedNumber,
      })
      .eq('id', studentId);
    if (updateAdmissionError) return redirect('/students?error=bed_change_failed');

    if (previousBedId && previousBedId !== newBedId) {
      await supabase.from('beds').update({ is_occupied: false }).eq('id', previousBedId);
    }
    await supabase.from('beds').update({ is_occupied: true }).eq('id', newBedId);

    const normalizedEmail = (studentRow.email || '').trim().toLowerCase();
    if (normalizedEmail) {
      const { data: userRow } = await supabase
        .from('users')
        .select('id')
        .ilike('email', normalizedEmail)
        .maybeSingle();
      if (userRow?.id) {
        await supabase.from('students').update({ bed_id: newBedId }).eq('user_id', userRow.id);
      }
    }

    await addActivityLog({
      module: 'Students',
      action: 'Bed Changed',
      details: `${studentRow.full_name || `Student #${studentId}`} shifted to Room ${nextRoomNumber || '-'} / Bed ${nextBedNumber || '-'}`,
      actor: 'admin',
      level: 'info',
    });

    revalidatePath('/students');
    revalidatePath('/rooms');
    revalidatePath('/');
    return redirect('/students?error=bed_change_success');
  }

  async function deleteStudentPermanently(formData: FormData) {
    'use server';
    const id = Number(formData.get('id') || 0);
    if (!id) return;

    const { data: studentRow } = await supabase
      .from('student_admissions')
      .select('id, full_name, email, bed_id')
      .eq('id', id)
      .single();

    if (!studentRow) return;

    if (studentRow.bed_id) {
      await supabase.from('beds').update({ is_occupied: false }).eq('id', studentRow.bed_id);
    }

    // Remove finance rows tied to this admission id.
    await supabase.from('invoices').delete().eq('student_id', id);

    // Remove legacy link rows and portal user by email.
    const normalizedEmail = (studentRow.email || '').trim().toLowerCase();
    if (normalizedEmail) {
      const { data: userRow } = await supabase
        .from('users')
        .select('id')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (userRow?.id) {
        const { data: legacyStudents } = await supabase
          .from('students')
          .select('id')
          .eq('user_id', userRow.id);

        const legacyIds = (legacyStudents || []).map((row: any) => Number(row.id)).filter((value: number) => Number.isFinite(value));
        if (legacyIds.length > 0) {
          await supabase.from('complaints').delete().in('student_id', legacyIds);
        }
        await supabase.from('students').delete().eq('user_id', userRow.id);
        await supabase.from('users').delete().eq('id', userRow.id);
      }
    }

    await supabase.from('student_admissions').delete().eq('id', id);
    await removeStudentElectricityData(id);
    await removeStudentMaintenanceData(id);

    await addActivityLog({
      module: 'Students',
      action: 'Student Deleted Permanently',
      details: `${studentRow.full_name || `Student #${id}`} removed from admissions and linked tables`,
      actor: 'admin',
      level: 'critical',
    });

    revalidatePath('/students');
    revalidatePath('/rooms');
    revalidatePath('/finance');
    revalidatePath('/helpdesk');
    revalidatePath('/portal');
    revalidatePath('/');
  }

  const viewingStudent = viewId ? studentsWithElectricity.find((s: any) => s.id.toString() === viewId) : null;
  const qrStudent = qrId ? studentsWithElectricity.find((s: any) => s.id.toString() === qrId) : null;

  const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

  const makeQrPayload = (email: string, phone: string) => {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const normalizedPhone = (phone || '').toString().replace(/\D+/g, '');
    return `${appBaseUrl}/portal-login?email=${encodeURIComponent(normalizedEmail)}&password=${encodeURIComponent(normalizedPhone)}`;
  };

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

      {studentError && !showAddForm && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm font-semibold relative z-10 ${
            studentError === 'bed_change_success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {studentError === 'bed_change_success' && 'Bed assignment updated successfully.'}
          {studentError === 'bed_change_invalid_student' && 'Student record is invalid or inactive.'}
          {studentError === 'bed_change_invalid_bed' && 'Selected bed is invalid.'}
          {studentError === 'bed_change_occupied' && 'Selected bed is already occupied. Choose another vacant bed.'}
          {studentError === 'bed_change_failed' && 'Could not update bed assignment. Please retry.'}
        </div>
      )}

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

                      <Link
                        href={`/students?view=${student.id}&qr=${student.id}`}
                        className="h-9 w-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-sm transition-colors"
                        title="Student Login Barcode"
                      >
                        <span className="text-base leading-none">⌁</span>
                      </Link>

                      <form action={changeStudentBed} className="flex items-center gap-2">
                        <input type="hidden" name="student_id" value={student.id} />
                        <select
                          name="new_bed_id"
                          required
                          defaultValue={student.bed_id ? String(student.bed_id) : ''}
                          className="min-w-[11rem] rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          <option value="" disabled>
                            Select vacant bed
                          </option>
                          {student.bed_id && bedsById.get(Number(student.bed_id)) && (
                            <option value={student.bed_id}>
                              Current: Room {(bedsById.get(Number(student.bed_id)) as any)?.rooms?.room_number} - Bed {(bedsById.get(Number(student.bed_id)) as any)?.bed_number}
                            </option>
                          )}
                          {vacantBeds.map((bed: any) => (
                            <option key={`move-bed-${student.id}-${bed.id}`} value={bed.id}>
                              Room {bed.rooms?.room_number} - Bed {bed.bed_number}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="text-amber-700 hover:text-amber-800 font-bold text-xs uppercase tracking-wider bg-amber-50 hover:bg-amber-100 px-3 py-2 rounded-lg transition-colors border border-amber-100 whitespace-nowrap"
                        >
                          Change Bed
                        </button>
                      </form>
                      
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

      {/* LEFT / ALUMNI TABLE WITH HARD DELETE */}
      <div className="bg-white rounded-3xl shadow-sm border border-rose-100 overflow-hidden relative z-10 mb-8">
        <div className="p-6 border-b border-rose-100 bg-rose-50/40">
          <h3 className="text-lg font-black text-slate-800">Left / Alumni Records</h3>
          <p className="text-xs text-slate-500 mt-1">Hard delete removes student data from linked project tables.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white text-slate-400 text-xs uppercase tracking-widest border-b border-slate-100">
              <tr>
                <th className="p-6">Resident</th>
                <th className="p-6">Contact</th>
                <th className="p-6">Status</th>
                <th className="p-6 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm bg-white">
              {leftStudents.map((student: any) => (
                <tr key={`left-${student.id}`} className="hover:bg-slate-50 transition-colors">
                  <td className="p-6">
                    <p className="font-bold text-slate-900">{student.full_name}</p>
                    <p className="text-xs text-slate-500 mt-1">{student.coaching_name || 'No Coaching Info'}</p>
                  </td>
                  <td className="p-6">
                    <p className="font-medium text-slate-700">{student.phone || 'N/A'}</p>
                    <p className="text-xs text-slate-500 mt-1">{student.email || 'N/A'}</p>
                  </td>
                  <td className="p-6">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                      LEFT
                    </span>
                  </td>
                  <td className="p-6">
                    <div className="flex justify-center">
                      <form action={deleteStudentPermanently}>
                        <input type="hidden" name="id" value={student.id} />
                        <button
                          type="submit"
                          className="text-rose-600 hover:text-rose-700 font-bold text-xs uppercase tracking-wider bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-lg transition-colors border border-rose-100"
                        >
                          Delete Permanently
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {leftStudents.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-slate-400 italic">
                    No left/alumni records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADMISSION FORM MODAL */}
      {showAddForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-center items-start p-2 sm:p-3 overflow-hidden">
          <div className="w-full flex justify-center">
            <div className="origin-top w-full max-w-5xl scale-[0.48] sm:scale-[0.56] md:scale-[0.64] lg:scale-[0.72] xl:scale-[0.8] 2xl:scale-[0.88]">
              <div className="bg-white rounded-[2rem] shadow-2xl w-full overflow-hidden border border-white/20">
            
            <div className="bg-indigo-600 p-4 flex justify-between items-center text-white">
              <div>
                <h3 className="text-2xl font-black tracking-tight">📝 New Student Admission</h3>
                <p className="text-indigo-200 text-sm mt-1 font-medium">Fill in all details to secure a bed.</p>
              </div>
              <Link href="/students" className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-xl transition-colors backdrop-blur-md">✕</Link>
            </div>

            <form action={admitStudent} className="p-5">
              {addError && (
                <div
                  className={`mb-5 rounded-xl border px-4 py-3 text-sm font-semibold ${
                    addError === 'email_used'
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                  }`}
                >
                  {addError === 'email_used' && 'Email id is already used. Try another one.'}
                  {addError === 'bed_occupied' && 'Selected bed is occupied. Please choose another bed.'}
                  {addError === 'user_create_failed' && 'Portal user could not be created. Please retry.'}
                  {addError === 'admission_failed' && 'Admission failed. Please check details and retry.'}
                  {addError === 'invalid_name' && 'Enter valid full name (letters/spaces only, min 3 characters).'}
                  {addError === 'invalid_email' && 'Enter a valid email address.'}
                  {addError === 'invalid_phone' && 'Enter a valid 10-digit mobile number.'}
                  {addError === 'invalid_dob' && 'Date of birth is invalid. Allowed age range is 12 to 60 years.'}
                  {addError === 'invalid_address' && 'Home address should be at least 10 characters.'}
                  {addError === 'invalid_parent_name' && 'Enter valid parent name (letters/spaces only, min 3 characters).'}
                  {addError === 'invalid_parent_phone' && 'Enter valid parent 10-digit mobile number.'}
                  {addError === 'invalid_coaching' && 'Coaching/college name is too short.'}
                  {addError === 'invalid_timing' && 'Timing value is too short.'}
                  {addError === 'invalid_security_deposit' && 'Security deposit must be between 0 and 50,00,000.'}
                  {addError === 'invalid_advance_rent' && 'Advance rent must be between 0 and 50,00,000.'}
                  {addError === 'invalid_electricity_units' && 'Electricity units must be between 0 and 1,00,000.'}
                  {addError === 'invalid_electricity_rate' && 'Electricity rate must be between 0 and 10,000.'}
                  {addError === 'invalid_maintenance_deposit' && 'Maintenance deposit must be between 0 and 50,00,000.'}
                  {addError === 'invalid_bed' && 'Selected bed is invalid. Please choose again.'}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                
                {/* PERSONAL INFO */}
                <div className="flex flex-col gap-4">
                  <h4 className="font-black text-slate-800 border-b border-slate-100 pb-2 uppercase tracking-widest text-xs">Personal Info</h4>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Full Name</label>
                    <input type="text" name="full_name" required minLength={3} maxLength={60} pattern="[A-Za-z ]+" title="Use letters and spaces only" placeholder="e.g. Rahul Kumar" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Email Address (PORTAL USERNAME)</label>
                    <input type="email" name="email" required maxLength={120} placeholder="rahul@example.com" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Date of Birth</label>
                      <input type="date" name="date_of_birth" required max={new Date().toISOString().slice(0, 10)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none" />
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
                    <textarea name="home_address" required minLength={10} maxLength={300} rows={2} placeholder="Full residential address" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"></textarea>
                  </div>
                </div>

                {/* ACADEMICS & CONTACT */}
                <div className="flex flex-col gap-4">
                  <h4 className="font-black text-slate-800 border-b border-slate-100 pb-2 uppercase tracking-widest text-xs">Academics & Contact</h4>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Phone Number (PORTAL PASSWORD)</label>
                    <input type="tel" name="phone" required pattern="[6-9][0-9]{9}" title="Enter valid 10-digit mobile number" maxLength={10} placeholder="9876543210" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    <p className="text-[10px] font-bold text-amber-600 mt-1">Login PIN will be the last 4 digits of this phone number.</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 text-rose-500">Parent Name</label>
                      <input type="text" name="parent_name" required minLength={3} maxLength={60} pattern="[A-Za-z ]+" title="Use letters and spaces only" placeholder="Name" className="w-full bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium placeholder-rose-300 focus:ring-2 focus:ring-rose-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 text-rose-500">Parent Phone</label>
                      <input type="tel" name="parent_phone" required pattern="[6-9][0-9]{9}" title="Enter valid 10-digit mobile number" maxLength={10} placeholder="Number" className="w-full bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium placeholder-rose-300 focus:ring-2 focus:ring-rose-500 outline-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Coaching / College Name</label>
                    <input type="text" name="coaching_name" minLength={2} maxLength={80} placeholder="e.g. Allen, Resonance" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
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
                      <input type="text" name="timing" minLength={3} maxLength={40} placeholder="8 AM - 2 PM" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
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
                      <input type="number" name="security_deposit" min={0} max={5000000} step="0.01" placeholder="₹5000" className="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-3 py-2 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Deposit Date</label>
                      <input type="date" name="deposit_date" defaultValue={new Date().toISOString().slice(0, 10)} className="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-3 py-2 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Maintenance Deposit</label>
                      <input type="number" name="maintenance_deposit" min={0} max={5000000} step="0.01" placeholder="₹1500" className="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-3 py-2 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Maintenance Deposit Date</label>
                      <input type="date" name="maintenance_deposit_date" defaultValue={new Date().toISOString().slice(0, 10)} className="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-3 py-2 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>
                  </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Advance Rent (Monthly Base Rent)</label>
                        <input type="number" name="advance_rent" min={0} max={5000000} step="0.01" placeholder="₹6000" className="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-3 py-2 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Rent Date</label>
                        <input type="date" name="rent_date" defaultValue={new Date().toISOString().slice(0, 10)} className="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-3 py-2 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Electricity Units</label>
                        <input type="number" step="0.01" min={0} max={100000} name="electricity_units" placeholder="e.g. 120" className="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-3 py-2 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Rs per Unit</label>
                        <input type="number" step="0.01" min={0} max={10000} name="electricity_rate_per_unit" placeholder="e.g. 12" className="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-3 py-2 text-sm text-slate-900 font-medium placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none" />
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
          </div>
        </div>
      )}

      {/* VIEW PROFILE MODAL */}
      {viewingStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex justify-center items-start p-2 sm:p-3 overflow-hidden">
          <div className="w-full flex justify-center">
            <div className="origin-top w-full max-w-2xl scale-[0.7] sm:scale-[0.78] md:scale-[0.88] lg:scale-[0.95] xl:scale-100">
              <div className="bg-white rounded-[2rem] shadow-2xl w-full overflow-hidden border border-white/20 relative">
            
            <div className="bg-slate-900 p-6 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/30 rounded-full blur-[50px] -translate-y-1/2 translate-x-1/3"></div>
              <div className="relative z-10 flex justify-between items-start">
                <div>
                  <h3 className="text-3xl font-black tracking-tighter">{viewingStudent.full_name}</h3>
                  <p className="text-indigo-300 font-medium tracking-widest uppercase text-xs mt-2">{viewingStudent.room_number ? `Room ${viewingStudent.room_number} • Bed ${viewingStudent.bed_number}` : 'Unassigned Bed'}</p>
                </div>
                <Link href="/students" className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-sm transition-colors backdrop-blur-md">✕</Link>
              </div>
            </div>

            <div className="p-6 grid grid-cols-2 gap-y-4 gap-x-6">
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
                  <p className="font-bold text-slate-800 text-sm">Maintenance Deposit: ₹{viewingStudent.maintenance_deposit || 0}</p>
                  <p className="font-bold text-slate-800 text-sm">Maintenance Deposit Date: {viewingStudent.maintenance_deposit_date ? new Date(viewingStudent.maintenance_deposit_date).toLocaleDateString('en-IN') : 'N/A'}</p>
                  <p className="font-bold text-slate-800 text-sm">Advance Rent/bed: ₹{viewingStudent.advance_rent || 0}</p>
                  <p className="font-bold text-slate-800 text-sm">initial Meter Unit : {viewingStudent.electricity_units || 0}</p>
                  <p className="font-bold text-slate-800 text-sm">Rs/Unit: ₹{viewingStudent.electricity_rate_per_unit || 0}</p>
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
                <div className="mt-5">
                  <Link
                    href={`/students?view=${viewingStudent.id}&qr=${viewingStudent.id}`}
                    className="h-20 w-20 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-lg transition-all hover:scale-105"
                    title="Student Login Barcode"
                  >
                    <span className="text-3xl leading-none">⌁</span>
                  </Link>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Student Login Barcode</p>
                </div>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Home Address</p>
                <p className="font-medium text-slate-700 text-sm leading-relaxed">{viewingStudent.home_address}</p>
              </div>
            </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* LOGIN QR CARD MODAL */}
      {qrStudent && (
        <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-md z-[60] flex justify-center items-start p-2 sm:p-3 overflow-hidden">
          <div className="w-full flex justify-center">
            <div className="origin-top w-full max-w-xl scale-[0.76] sm:scale-[0.86] md:scale-[0.94] lg:scale-100">
              <div className="bg-white rounded-[2rem] shadow-2xl w-full overflow-hidden border border-white/20">
            <div className="bg-indigo-600 p-6 flex justify-between items-start text-white">
              <div>
                <h3 className="text-2xl font-black tracking-tight">Student Login Barcode</h3>
                <p className="text-indigo-200 text-sm mt-1 font-medium">Print and hand this to the student.</p>
              </div>
              <Link href={viewId ? `/students?view=${viewId}` : '/students'} className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-xl transition-colors backdrop-blur-md">✕</Link>
            </div>

            <div className="p-8">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-lg font-black text-slate-800">{qrStudent.full_name}</p>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Portal Access QR</p>

                <div className="mt-6 flex justify-center">
                  <img
                    src={`https://quickchart.io/qr?size=260&text=${encodeURIComponent(makeQrPayload(qrStudent.email, qrStudent.phone))}`}
                    alt="Student login QR"
                    className="h-[260px] w-[260px] rounded-xl border border-slate-200 bg-white p-2"
                  />
                </div>

                <p className="text-[11px] text-slate-500 text-center mt-3">Scan this QR to open Student Portal login directly.</p>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <PrintCardButton />
                <Link
                  href={viewId ? `/students?view=${viewId}` : '/students'}
                  className="px-6 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-colors"
                >
                  Close
                </Link>
              </div>
            </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
