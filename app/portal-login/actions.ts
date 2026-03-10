'use server';

import { supabase } from '../../lib/supabase';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { addActivityLog } from '../../lib/activity-log-cache';

export async function loginStudent(formData: FormData) {
  const email = formData.get('email')?.toString().trim();
  const phonePassword = formData.get('password')?.toString().replace(/\D+/g, '');
  const pin = formData.get('pin')?.toString().replace(/\D+/g, '');

  if (!email || !phonePassword || !pin) {
    redirect('/portal-login?error=Please fill all fields');
  }

  // 1. Fetch latest active admissions for this email (case-insensitive)
  const { data: students, error } = await supabase
    .from('student_admissions')
    .select('id, phone')
    .ilike('email', email)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: false })
    .limit(5);

  const student = students?.find((s) => {
    const fullPhone = (s.phone || '').toString().replace(/\D+/g, '');
    const last4Pin = fullPhone.slice(-4);
    return fullPhone === phonePassword && last4Pin === pin;
  }) || null;

  // 2. If incorrect, bounce them back with error
  if (error || !student) {
    await addActivityLog({
      module: 'Portal Login',
      action: 'Login Failed',
      details: `Failed login attempt for email ${email}`,
      actor: 'student',
      level: 'warning',
    });
    redirect('/portal-login?error=Invalid Email, Phone Number, or 4-digit PIN');
  }

  // 3. Set the secure cookie properly
  const cookieStore = await cookies();
  cookieStore.set('hmp_student_token', student.id.toString(), {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
  });
  await addActivityLog({
    module: 'Portal Login',
    action: 'Login Success',
    details: `Student ID ${student.id} logged in via portal`,
    actor: 'student',
    level: 'info',
  });

  // 4. Safely redirect to dashboard
  redirect('/portal');
}
