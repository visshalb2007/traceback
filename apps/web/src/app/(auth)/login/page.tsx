'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthedRedirect } from '@/hooks/use-authed-redirect';
import { authApi } from '@/lib/api';
import { errorMessage } from '@/lib/api-client';

export default function LoginPage() {
  useAuthedRedirect();

  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const tokens = await authApi.login({ email: email.trim(), password });
      signIn(tokens);
      toast.success(`Welcome back, ${tokens.user.name}`);
      router.replace('/projects');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>Pick up where the last incident left off.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          {error ? <Alert variant="error">{error}</Alert> : null}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••••"
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          No account?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
