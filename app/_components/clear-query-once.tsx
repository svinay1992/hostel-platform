'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export default function ClearQueryOnce({
  shouldClear,
  delayMs = 3500,
}: {
  shouldClear: boolean;
  delayMs?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!shouldClear) return;
    const timer = window.setTimeout(() => {
      router.replace(pathname);
    }, Math.max(0, delayMs));
    return () => window.clearTimeout(timer);
  }, [delayMs, pathname, router, shouldClear]);

  return null;
}
