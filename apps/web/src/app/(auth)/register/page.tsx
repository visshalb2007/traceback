'use client';

import { registerSchema } from '@traceback/shared';
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

export default function RegisterPage() {
  useAuthedRedirect();

  const router = useRouter();
  const { signIn } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    // Validate with the very schema the API enforces, so the rules can't drift.
    const parsed = registerSchema.safeParse({ name: name.trim(), email: email.trim(), password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the form');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setPending(true);
    try {
      const tokens = await authApi.register(parsed.data);
      signIn(tokens);
      toast.success(`Welcome to TraceBack, ${tokens.user.name}`);
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
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>Spin up a project and start recording deploys.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          {error ? <Alert variant="error">{error}</Alert> : null}
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ada Lovelace"
            />
          </div>
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
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 10 characters"
            />
            <p className="text-xs text-muted-foreground">
              Must include an uppercase letter, a lowercase letter and a digit.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
