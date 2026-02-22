export const dynamic = 'force-dynamic';

import { loginStudent } from './actions';

export default async function PortalLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const resolvedParams = await searchParams;
  const errorMessage = resolvedParams?.error;

  return (
    <div className="fixed top-0 left-0 w-[100vw] h-[100vh] z-[9999] bg-[#F4F7FF] flex items-center justify-center font-sans p-4 overflow-y-auto m-0">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-10 left-[-10%] w-96 h-96 bg-indigo-200/30 rounded-full blur-3xl mix-blend-multiply opacity-70"></div>
        <div className="absolute bottom-10 right-[-5%] w-80 h-80 bg-blue-200/30 rounded-full blur-3xl mix-blend-multiply opacity-70"></div>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-indigo-100/50 p-10 border border-slate-100 relative z-10">
        <h1 className="text-2xl font-black text-indigo-700 tracking-tight text-center mb-1">Student Portal</h1>
        <p className="text-sm font-medium text-slate-500 text-center mb-8">Log in with your registered details</p>

        {errorMessage && (
          <div className="mb-6 p-3 bg-rose-50 border border-rose-200 text-rose-600 rounded-lg text-sm font-bold text-center">
            {errorMessage}
          </div>
        )}

        <form action={loginStudent} className="flex flex-col gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">Registered Email</label>
            <input
              type="email"
              name="email"
              required
              placeholder="student@example.com"
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3.5 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">Mobile Number (Password)</label>
            <input
              type="password"
              name="password"
              required
              placeholder="9876543210"
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3.5 text-sm text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all tracking-widest"
            />
          </div>

          <button type="submit" className="w-full bg-[#4F46E5] hover:bg-indigo-700 text-white font-bold text-sm py-4 rounded-lg transition-transform hover:-translate-y-0.5 shadow-md mt-2">
            Secure Login
          </button>
        </form>
      </div>
    </div>
  );
}
