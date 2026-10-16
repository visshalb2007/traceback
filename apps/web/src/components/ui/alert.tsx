import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

const icons = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle2,
} as const;

const tones = {
  info: 'border-blue-500/30 bg-blue-500/5 text-blue-600 dark:text-blue-400',
  warning: 'border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400',
  error: 'border-destructive/30 bg-destructive/5 text-destructive',
  success: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400',
} as const;

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof tones;
  title?: string;
}

export function Alert({ className, variant = 'info', title, children, ...props }: AlertProps) {
  const Icon = icons[variant];
  return (
    <div
      role="alert"
      className={cn('flex gap-3 rounded-lg border p-4 text-sm', tones[variant], className)}
      {...props}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        {title ? <div className="font-medium">{title}</div> : null}
        <div className="text-foreground/80">{children}</div>
      </div>
    </div>
  );
}

/** Consistent inline error surface for failed queries. */
export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <Alert variant="error" title={title}>
      <div className="space-y-2">
        {description ? <p>{description}</p> : null}
        {onRetry ? (
          <button className="font-medium underline underline-offset-4" onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>
    </Alert>
  );
}

/** Consistent empty surface. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <p className="font-medium">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action}
    </div>
  );
}
