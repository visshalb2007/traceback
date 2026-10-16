'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  LayoutDashboard,
  LogOut,
  Rocket,
  Settings,
  Siren,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Brand } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjects } from '@/hooks/use-projects';
import { roleMeta } from '@/lib/labels';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  segment: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', segment: '', icon: LayoutDashboard },
  { label: 'Timeline', segment: 'timeline', icon: Activity },
  { label: 'Deployments', segment: 'deployments', icon: Rocket },
  { label: 'Incidents', segment: 'incidents', icon: Siren },
  { label: 'Settings', segment: 'settings', icon: Settings },
];

function NavLinks({ projectId }: { projectId: string | undefined }) {
  const pathname = usePathname();

  if (!projectId) return null;

  return (
    <nav className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const href = item.segment
          ? `/projects/${projectId}/${item.segment}`
          : `/projects/${projectId}`;
        const active = item.segment ? pathname.startsWith(href) : pathname === href;
        return (
          <Link
            key={item.label}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, ready, signOut } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams<{ projectId?: string }>();
  const projectId = params?.projectId;
  const pathname = usePathname();

  const projects = useProjects();
  const activeProject = projects.data?.find((project) => project.id === projectId);

  useEffect(() => {
    if (ready && !user) router.replace('/login');
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Skeleton className="h-40 w-72" />
      </div>
    );
  }

  const projectOptions = [
    {
      value: '',
      label: projects.data?.length ? 'Select a project…' : 'No projects yet',
      disabled: true,
    },
    ...(projects.data ?? []).map((project) => ({ value: project.id, label: project.name })),
  ];

  const onChangeProject = (value: string): void => {
    if (value) router.push(`/projects/${value}`);
  };

  const onSignOut = async (): Promise<void> => {
    await signOut();
    queryClient.clear();
    router.replace('/login');
  };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card/40 md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <Brand />
        </div>

        <div className="space-y-2 border-b p-3">
          <Select
            aria-label="Active project"
            value={projectId ?? ''}
            options={projectOptions}
            onChange={(event) => onChangeProject(event.target.value)}
          />
          {activeProject ? (
            <div className="flex items-center justify-between px-1">
              <span className="truncate text-xs text-muted-foreground">{activeProject.slug}</span>
              <Badge
                variant={roleMeta[activeProject.role as keyof typeof roleMeta]?.tone ?? 'muted'}
              >
                {roleMeta[activeProject.role as keyof typeof roleMeta]?.label ?? activeProject.role}
              </Badge>
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
          <NavLinks projectId={projectId} />
          <div className="mt-4">
            <Link
              href="/projects"
              className={cn(
                'block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                pathname === '/projects' ? 'text-foreground' : '',
              )}
            >
              All projects
            </Link>
          </div>
        </div>

        <div className="space-y-2 border-t p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
            <ThemeToggle />
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={onSignOut}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-6">
          <div className="md:hidden">
            <Brand />
          </div>
          <div className="ml-auto flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={onSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          <div className="hidden md:block" />
        </header>

        {projectId ? (
          <div className="flex gap-1 overflow-x-auto border-b bg-card/40 px-3 py-2 md:hidden">
            {NAV_ITEMS.map((item) => {
              const href = item.segment
                ? `/projects/${projectId}/${item.segment}`
                : `/projects/${projectId}`;
              return (
                <Link
                  key={item.label}
                  href={href}
                  className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ) : null}

        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
