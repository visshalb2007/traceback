'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { ErrorState } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useProject } from '@/hooks/use-projects';
import { errorMessage } from '@/lib/api-client';

/**
 * Every project-scoped page needs the project to exist and the caller to be a member.
 * Resolving it once here keeps 404/403 handling out of each page.
 */
export default function ProjectLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ projectId: string }>();
  const project = useProject(params.projectId);

  if (project.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (project.isError) {
    return (
      <ErrorState
        title="Cannot open this project"
        description={errorMessage(project.error)}
        onRetry={() => void project.refetch()}
      />
    );
  }

  return <>{children}</>;
}
