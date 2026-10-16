import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="space-y-4 text-center">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-3xl font-semibold">This route left no trace</h1>
        <p className="text-muted-foreground">
          The page you were looking for does not exist or was moved.
        </p>
        <Button asChild>
          <Link href="/">Back to safety</Link>
        </Button>
      </div>
    </div>
  );
}
