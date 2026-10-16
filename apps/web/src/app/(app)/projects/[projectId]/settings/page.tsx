'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiKeysTab } from './api-keys-tab';
import { AuditTab } from './audit-tab';
import { MembersTab } from './members-tab';
import { WebhooksTab } from './webhooks-tab';

export default function SettingsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Settings"
        description="Members, integrations and the audit trail for this project."
      />

      <Tabs defaultValue="members">
        <TabsList className="flex-wrap">
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="api-keys">API keys</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <MembersTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="webhooks">
          <WebhooksTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="api-keys">
          <ApiKeysTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
