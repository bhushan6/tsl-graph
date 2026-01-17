'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending) {
      if (session) {
        router.replace('/dashboard');
      } else {
        router.replace('/sign-in');
      }
    }
  }, [isPending, session, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}
