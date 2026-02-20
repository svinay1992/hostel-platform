import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { supabase } from '../../lib/supabase';

export default async function StudentLoginPage() {
  
  async function handleStudentLogin(formData: FormData) {
    'use server'; 
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;

    // 1. Find the user by their email
    const { data: userData } = await supabase.from('users').select('id').eq('email', email).single();

    if (userData) {
      // 2. Verify they are a student by matching their phone number
      const { data: studentData } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', userData.id)
        .eq('phone_number', phone)
        .single();

      if (studentData) {
        // SUCCESS! Issue a secure digital student badge with their specific ID
        const cookieStore = await cookies();
        cookieStore.set('hmp_student_token', studentData.id.toString(), { 
          httpOnly: true, 
          secure: true,
          maxAge: 60 * 60 * 24 * 7 // Badge stays active for 1 week!
        });
        
        redirect('/portal'); 
      }
    }
    
    // If details are wrong, refresh with an error
    redirect('/portal-login?error=true');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-50 font-sans">
      <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full border border-gray-200">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-100 mb-4">
            <span className="text-2xl">🎓</span>
          </div>
          <h1 className="text-3xl font-extrabold text-indigo-600 tracking-tight">Student Portal</h1>
          <p className="text-gray-500 mt-2 font-medium">Log in with your registered details</p>
        </div>

        <form action={handleStudentLogin} className="flex flex-col gap-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Registered Email</label>
            <input type="email" name="email" required placeholder="rohan@example.com" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Phone Number (Password)</label>
            <input type="text" name="phone" required placeholder="9876543210" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm mt-4">
            Access My Portal
          </button>
        </form>
      </div>
    </div>
  );
}