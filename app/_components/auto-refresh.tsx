'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

type AutoRefreshProps = {
  intervalMs?: number;
};

export default function AutoRefresh({ intervalMs = 5000 }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => clearInterval(id);
  }, [intervalMs, router]);

  return null;
}
