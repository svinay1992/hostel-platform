import { redirect } from 'next/navigation';

export default function LoginPage() {
  
  // THE SERVER ACTION: This acts as the security bouncer
  async function handleLogin(formData: FormData) {
    'use server'; // Runs securely on the backend
    
    const email = formData.get('email');
    const password = formData.get('password');

    // Simulating database authentication
    // Only let the user in if they know the exact credentials
    if (email === 'admin@hostel.com' && password === 'admin123') {
      redirect('/'); // Success! Send them to the Master Dashboard
    } else {
      // If wrong, refresh the login page (we can add error messages later!)
      redirect('/login?error=true');
    }
  }

  return (
    // THE CSS TRICK: 'fixed inset-0 z-50' forces this screen to cover the entire browser, hiding the sidebar!
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-100 font-sans">
      
      {/* LOGIN CARD */}
      <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full border border-gray-200">
        
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-100 mb-4">
            <span className="text-2xl">🔐</span>
          </div>
          <h1 className="text-3xl font-extrabold text-indigo-600 tracking-tight">HMP Access</h1>
          <p className="text-gray-500 mt-2 font-medium">Sign in to the Admin Control Center</p>
        </div>

        {/* LOGIN FORM */}
        <form action={handleLogin} className="flex flex-col gap-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Admin Email</label>
            <input 
              type="email" 
              name="email" 
              required 
              defaultValue="admin@hostel.com"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Password</label>
            <input 
              type="password" 
              name="password" 
              required 
              defaultValue="admin123"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          <button 
            type="submit" 
            className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm mt-4"
          >
            Secure Sign In
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">Hostel Management Platform v1.0</p>
        </div>

      </div>
    </div>
  );
}