import type { ReactNode } from 'react';
import { Brand } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <Brand className="mb-6" />
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 max-w-sm text-center text-xs text-muted-foreground">
        Incident tracking and deployment monitoring. Ask the only question that matters: who broke
        the build?
      </p>
    </div>
  );
}
