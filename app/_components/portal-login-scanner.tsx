'use client';

import { useEffect, useRef, useState } from 'react';

type ScanPayload = {
  email: string;
  password: string;
};

type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike;
  }
}

function parsePayload(rawValue: string): ScanPayload | null {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<ScanPayload>;
    if (parsed.email && parsed.password) {
      return { email: parsed.email.trim(), password: parsed.password.trim() };
    }
  } catch {
    // Fallback to delimiter format.
  }

  const parts = rawValue.split('|').map((part) => part.trim());
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return { email: parts[0], password: parts[1] };
  }

  return null;
}

export default function PortalLoginScanner() {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopScanner = () => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopScanner();
  }, []);

  const applyCredentials = (payload: ScanPayload) => {
    const emailInput = document.getElementById('student-login-email') as HTMLInputElement | null;
    const passwordInput = document.getElementById('student-login-password') as HTMLInputElement | null;
    if (!emailInput || !passwordInput) return;

    emailInput.value = payload.email;
    passwordInput.value = payload.password;
    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const scanLoop = async () => {
    const detector = detectorRef.current;
    const video = videoRef.current;
    if (!detector || !video) return;

    try {
      const results = await detector.detect(video);
      const rawValue = results?.[0]?.rawValue?.trim();
      if (rawValue) {
        if (/^https?:\/\//i.test(rawValue) && rawValue.includes('/portal-login')) {
          stopScanner();
          window.location.assign(rawValue);
          return;
        }

        const parsed = parsePayload(rawValue);
        if (parsed) {
          applyCredentials(parsed);
          setStatus('QR scanned. Credentials filled. Enter your 4-digit PIN to continue.');
          stopScanner();
          return;
        }
        setStatus('QR detected but format is invalid.');
      }
    } catch {
      // Continue scanning on transient detector errors.
    }

    rafRef.current = window.requestAnimationFrame(scanLoop);
  };

  const startScanner = async () => {
    setStatus('');

    if (!window.BarcodeDetector) {
      setStatus('Scanner is not supported in this browser. Use Chrome/Edge.');
      return;
    }

    try {
      detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      setStatus('Scanning...');
      rafRef.current = window.requestAnimationFrame(scanLoop);
    } catch {
      setStatus('Camera permission denied or unavailable.');
      stopScanner();
    }
  };

  const openAndStart = async () => {
    setIsOpen(true);
    setTimeout(() => {
      void startScanner();
    }, 100);
  };

  const closeScanner = () => {
    stopScanner();
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={openAndStart}
        className="absolute right-5 top-5 h-12 w-12 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 transition-colors flex items-center justify-center"
        title="Scan Login QR"
      >
        <span className="text-xl">⌁</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[10000] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Scan Student Login QR</h3>
              <button type="button" onClick={closeScanner} className="h-8 w-8 rounded-full bg-slate-100 text-slate-700">
                ✕
              </button>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-black">
              <video ref={videoRef} className="h-64 w-full object-cover" playsInline muted />
            </div>
            {status && <p className="mt-3 text-xs font-bold text-slate-600">{status}</p>}
          </div>
        </div>
      )}
    </>
  );
}
