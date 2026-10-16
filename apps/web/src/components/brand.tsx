import Link from 'next/link';
import { cn } from '@/lib/utils';

/** The one place the product mark is drawn, so it stays identical everywhere. */
export function Brand({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('flex items-center gap-2', className)}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-mono text-sm font-bold text-primary-foreground">
        TB
      </span>
      <span className="font-semibold tracking-tight">TraceBack</span>
    </Link>
  );
}
