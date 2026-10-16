'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys, projectsApi } from '@/lib/api';

/** The projects the signed-in user can see, flattened to the array callers want. */
export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: projectsApi.list,
    select: (data) => data.items,
  });
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.project(projectId ?? ''),
    queryFn: () => projectsApi.get(projectId as string),
    enabled: Boolean(projectId),
  });
}
