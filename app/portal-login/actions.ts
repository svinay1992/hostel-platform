'use server';

import { supabase } from '../../lib/supabase';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function loginStudent(formData: FormData) {
  const email = formData.get('email')?.toString().trim();
  const phonePassword = formData.get('password')?.toString().replace(/\D+/g, '');

  if (!email || !phonePassword) {
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

  const student = students?.find((s) => (s.phone || '').toString().replace(/\D+/g, '') === phonePassword) || null;

  // 2. If incorrect, bounce them back with error
  if (error || !student) {
    redirect('/portal-login?error=Invalid Email or Phone Number');
  }

  // 3. Set the secure cookie properly
  const cookieStore = await cookies();
  cookieStore.set('hmp_student_token', student.id.toString(), {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
  });

  // 4. Safely redirect to dashboard
  redirect('/portal');
}
