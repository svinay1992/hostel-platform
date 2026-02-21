import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hostel Management Platform",
  description: "Admin Dashboard for HMP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  // THE NEW SECURE LOGOUT ACTION FOR THE ADMIN
  async function handleAdminLogout() {
    'use server';
    const cookieStore = await cookies();
    cookieStore.delete('hmp_access_token');
    redirect('/login');
  }

  return (
    <html lang="en">
      <body className={`${inter.className} flex h-screen bg-gray-50 font-sans`}>
        
        {/* THE GLOBAL SIDEBAR */}
        <aside className="w-64 bg-white border-r shadow-sm flex flex-col">
          <div className="p-6 border-b">
            <h1 className="text-2xl font-extrabold text-indigo-600 tracking-tight">HMP Admin</h1>
          </div>
          
          <nav className="mt-6 flex flex-col gap-2 px-4 flex-1">
            <a href="/" className="text-gray-600 hover:bg-gray-100 px-4 py-3 rounded-lg font-medium transition-colors">📊 Master Dashboard</a>
            <a href="/rooms" className="text-gray-600 hover:bg-gray-100 px-4 py-3 rounded-lg font-medium transition-colors">🛏️ Rooms & Beds</a>
            <a href="/students" className="text-gray-600 hover:bg-gray-100 px-4 py-3 rounded-lg font-medium transition-colors">🎓 Students</a>
            <a href="/finance" className="text-gray-600 hover:bg-gray-100 px-4 py-3 rounded-lg font-medium transition-colors">💰 Finance & Billing</a>
            <a href="/helpdesk" className="text-gray-600 hover:bg-gray-100 px-4 py-3 rounded-lg font-medium transition-colors">🛠️ Helpdesk</a>
            <a href="/mess" className="text-gray-600 hover:bg-gray-100 px-4 py-3 rounded-lg font-medium transition-colors">🍲 Mess & Menu</a>
          <a href="/announcements" className="text-gray-600 hover:bg-gray-100 px-4 py-3 rounded-lg font-medium transition-colors">📢 Announcements</a>
          <a href="/expenses" className="text-gray-600 hover:bg-gray-100 px-4 py-3 rounded-lg font-medium transition-colors">📉 Expenses</a>
          <a href="/inventory" className="text-gray-600 hover:bg-gray-100 px-4 py-3 rounded-lg font-medium transition-colors">📦 Inventory</a>
          </nav>

          {/* THE NEW LOGOUT BUTTON */}
          <div className="p-4 border-t border-gray-100">
            <form action={handleAdminLogout}>
              <button type="submit" className="w-full flex justify-center items-center gap-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 font-bold py-3 px-4 rounded-lg transition-colors shadow-sm">
                <span>🚪</span> Secure Log Out
              </button>
            </form>
          </div>
        </aside>

        {/* PAGE CONTENT CONTEXT */}
        {children}

      </body>
    </html>
  );
}