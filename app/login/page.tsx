import { redirect } from 'next/navigation';
import { cookies } from 'next/headers'; 

export default function LoginPage() {
  
  async function handleLogin(formData: FormData) {
    'use server'; 
    
    const email = formData.get('email');
    const password = formData.get('password');

    if (email === 'admin@hostel.com' && password === 'admin123') {
      
      // THE FIX: We added 'await' here because Next.js 15 requires it!
      const cookieStore = await cookies();
      cookieStore.set('hmp_access_token', 'admin_secure_session', { 
        httpOnly: true, 
        secure: true,
        maxAge: 60 * 60 * 24 // Badge expires in 24 hours
      });
      
      redirect('/'); 
    } else {
      redirect('/login?error=true');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-100 font-sans">
      <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full border border-gray-200">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-100 mb-4">
            <span className="text-2xl">🔐</span>
          </div>
          <h1 className="text-3xl font-extrabold text-indigo-600 tracking-tight">HMP Access</h1>
          <p className="text-gray-500 mt-2 font-medium">Sign in to the Admin Control Center</p>
        </div>

        <form action={handleLogin} className="flex flex-col gap-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Admin Email</label>
            <input type="email" name="email" required defaultValue="admin@hostel.com" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Password</label>
            <input type="password" name="password" required defaultValue="admin123" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm mt-4">
            Secure Sign In
          </button>
        </form>
      </div>
    </div>
  );
}