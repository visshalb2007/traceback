'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';

/**
 * Auth pages must not be reachable once signed in. Redirecting in a hook keeps the
 * pages free of guard boilerplate and avoids a flash of the form.
 */
export function useAuthedRedirect(to = '/projects'): void {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && user) router.replace(to);
  }, [ready, user, router, to]);
}
