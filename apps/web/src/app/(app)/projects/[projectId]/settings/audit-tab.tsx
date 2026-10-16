'use client';

import { AUDIT_ACTIONS, type AuditAction } from '@traceback/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { EmptyState, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { auditApi, queryKeys } from '@/lib/api';
import { errorMessage } from '@/lib/api-client';
import { relativeTime } from '@/lib/utils';

export function AuditTab({ projectId }: { projectId: string }) {
  const [action, setAction] = useState<AuditAction | ''>('');

  const filters = { action: action || undefined, limit: 100 };

  const logs = useQuery({
    queryKey: queryKeys.audit(projectId, filters),
    queryFn: () => auditApi.list(projectId, filters),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Every mutation writes an immutable audit row in the same transaction.
        </p>
        <Select
          aria-label="Filter by action"
          className="w-44"
          value={action}
          options={[
            { value: '', label: 'All actions' },
            ...AUDIT_ACTIONS.map((value) => ({ value, label: value })),
          ]}
          onChange={(event) => setAction(event.target.value as AuditAction | '')}
        />
      </div>

      {logs.isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : logs.isError ? (
        <ErrorState description={errorMessage(logs.error)} onRetry={() => void logs.refetch()} />
      ) : logs.data.items.length === 0 ? (
        <EmptyState title="No audit entries" />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.data.items.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-xs" title={log.createdAt}>
                    {relativeTime(log.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs">{log.actorEmail ?? 'system'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{log.action}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className="font-medium">{log.entityType}</span>
                    <span className="ml-2 font-mono text-muted-foreground">
                      {log.entityId.slice(0, 8)}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {log.ip ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
