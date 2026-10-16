import { ArrowRight, GitBranch, Radar, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';

const features = [
  {
    icon: Radar,
    title: 'Correlation engine',
    body: 'Rank suspect deployments and changes for every incident using time proximity, affected services and author history — with human-readable reasons.',
  },
  {
    icon: GitBranch,
    title: 'Append-only event timeline',
    body: 'Late, duplicated and out-of-order events are first-class. Timelines are ordered by occurred_at, not arrival time.',
  },
  {
    icon: ShieldCheck,
    title: 'Conflict-free by design',
    body: 'Optimistic concurrency with three-way merges for overlapping edits, and a strict incident status state machine.',
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-mono text-sm font-bold text-primary-foreground">
            TB
          </span>
          <span className="font-semibold">TraceBack</span>
          <Badge variant="muted">beta</Badge>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col justify-center gap-12 py-16">
        <div className="max-w-3xl space-y-5">
          <Badge>Incident tracking · Deployment monitoring</Badge>
          <h1 className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
            Who broke the build?
          </h1>
          <p className="text-lg text-muted-foreground">
            TraceBack records deployments, code changes and incidents as an append-only event
            stream, then correlates them to tell you which change is most likely responsible.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/register">Create an account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">I already have one</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <feature.icon className="h-5 w-5 text-primary" />
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription>{feature.body}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          ))}
        </div>
      </main>

      <footer className="border-t py-6 text-sm text-muted-foreground">
        Built with Next.js, Fastify, Drizzle and Postgres.
      </footer>
    </div>
  );
}
