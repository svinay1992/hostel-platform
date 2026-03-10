'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

type PopupNotifierProps = {
  mode: 'admin-ticket' | 'student-portal';
  studentId?: number | string;
};

type ToastItem = {
  id: string;
  title: string;
  message: string;
};

export default function PopupNotifier({ mode, studentId }: PopupNotifierProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const isBootstrappedRef = useRef(false);
  const storageKeys = useMemo(() => {
    if (mode === 'admin-ticket') {
      return {
        ticket: 'hmp_last_seen_ticket_id',
      };
    }
    const studentSuffix = String(studentId || 'unknown');
    return {
      notice: `hmp_last_seen_notice_id_${studentSuffix}`,
      invoice: `hmp_last_seen_invoice_sig_${studentSuffix}`,
    };
  }, [mode, studentId]);

  useEffect(() => {
    let isMounted = true;

    const pushToast = (title: string, message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, title, message }]);

      window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, 5000);
    };

    const maybeNotifyBrowser = (title: string, message: string) => {
      if (typeof Notification === 'undefined') return;

      if (Notification.permission === 'granted') {
        new Notification(title, { body: message });
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') {
            new Notification(title, { body: message });
          }
        });
      }
    };

    const checkForUpdates = async () => {
      try {
        if (mode === 'admin-ticket') {
          const { data } = await supabase.from('complaints').select('*').order('id', { ascending: false }).limit(1);
          const latest = data?.[0];
          if (!latest || !isMounted) return;

          const latestId = Number(latest.id || 0);
          const rawStored = window.localStorage.getItem(storageKeys.ticket);
          const storedId = rawStored ? Number(rawStored) : 0;

          if (!isBootstrappedRef.current) {
            window.localStorage.setItem(storageKeys.ticket, String(latestId));
            isBootstrappedRef.current = true;
            return;
          }

          if (latestId > storedId) {
            const title = 'New Support Ticket';
            const message = `${latest.issue_type || 'Support'}: ${latest.description || 'A new student ticket was generated.'}`;
            pushToast(title, message);
            maybeNotifyBrowser(title, message);
            window.localStorage.setItem(storageKeys.ticket, String(latestId));
          }
          return;
        }

        if (!studentId) return;

        // Student notifications: announcements + billing updates.
        const [{ data: latestNoticeRows }, { data: latestInvoiceRows }] = await Promise.all([
          supabase.from('notices').select('*').order('id', { ascending: false }).limit(1),
          supabase.from('invoices').select('id, amount, status, due_date').eq('student_id', studentId).order('id', { ascending: false }).limit(1),
        ]);

        const latestNotice = latestNoticeRows?.[0];
        const latestInvoice = latestInvoiceRows?.[0] as { id?: number; amount?: number; status?: string; due_date?: string } | undefined;

        if (!isBootstrappedRef.current) {
          if (latestNotice?.id) {
            window.localStorage.setItem(storageKeys.notice, String(Number(latestNotice.id || 0)));
          }
          if (latestInvoice?.id) {
            const invoiceSig = `${Number(latestInvoice.id || 0)}:${String(latestInvoice.status || '').toLowerCase()}:${Number(latestInvoice.amount || 0)}`;
            window.localStorage.setItem(storageKeys.invoice, invoiceSig);
          }
          isBootstrappedRef.current = true;
          return;
        }

        if (latestNotice?.id) {
          const latestNoticeId = Number(latestNotice.id || 0);
          const noticeStoredRaw = window.localStorage.getItem(storageKeys.notice);
          const noticeStored = noticeStoredRaw ? Number(noticeStoredRaw) : 0;

          if (latestNoticeId > noticeStored) {
            const title = 'New Announcement';
            const message = `${latestNotice.title || 'Notice'}: ${latestNotice.message || 'A new announcement was posted.'}`;
            pushToast(title, message);
            maybeNotifyBrowser(title, message);
            window.localStorage.setItem(storageKeys.notice, String(latestNoticeId));
          }
        }

        if (latestInvoice?.id) {
          const currentSig = `${Number(latestInvoice.id || 0)}:${String(latestInvoice.status || '').toLowerCase()}:${Number(latestInvoice.amount || 0)}`;
          const storedSig = window.localStorage.getItem(storageKeys.invoice) || '';

          if (storedSig && storedSig !== currentSig) {
            const normalizedStatus = String(latestInvoice.status || '').toLowerCase();
            const title = 'Billing Update';
            const message =
              normalizedStatus === 'paid'
                ? `Payment received. Amount Rs ${Number(latestInvoice.amount || 0).toLocaleString('en-IN')}.`
                : `New bill update: Rs ${Number(latestInvoice.amount || 0).toLocaleString('en-IN')}${latestInvoice.due_date ? `, due ${new Date(latestInvoice.due_date).toLocaleDateString('en-IN')}` : ''}.`;
            pushToast(title, message);
            maybeNotifyBrowser(title, message);
          }

          window.localStorage.setItem(storageKeys.invoice, currentSig);
        }
      } catch (error) {
        console.error('POPUP NOTIFIER ERROR:', error);
      }
    };

    void checkForUpdates();
    const interval = window.setInterval(() => {
      void checkForUpdates();
    }, 3000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [mode, studentId, storageKeys]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-5 right-5 z-[100000] flex flex-col gap-3 w-[22rem] max-w-[calc(100vw-2rem)]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="rounded-xl border border-indigo-100 bg-white shadow-xl shadow-slate-300/40 px-4 py-3"
        >
          <p className="text-[11px] uppercase tracking-widest font-black text-indigo-500">Live Alert</p>
          <p className="text-sm font-bold text-slate-900 mt-1">{toast.title}</p>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">{toast.message}</p>
        </div>
      ))}
    </div>
  );
}
