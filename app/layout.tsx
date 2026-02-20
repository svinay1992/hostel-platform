import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

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
  return (
    <html lang="en">
      {/* We moved the background color and flexbox here to the body */}
      <body className={`${inter.className} flex h-screen bg-gray-50 font-sans`}>
        
        {/* 1. THE GLOBAL SIDEBAR: This will now show on EVERY page automatically */}
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
          </nav>
        </aside>

        {/* 2. THE PAGE CONTENT: Next.js injects your specific pages right here! */}
        {children}

      </body>
    </html>
  );
}