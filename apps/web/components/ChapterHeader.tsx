import Link from 'next/link';

export function ChapterHeader({ displayName }: { displayName?: string | null }) {
  return (
    <header className="border-b bg-background px-4 py-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Link href="/" className="text-lg font-semibold">
          TODOs for Dues
        </Link>
        {displayName ? (
          <span className="text-sm text-muted-foreground">
            Signed in as <strong className="text-foreground">{displayName}</strong>
          </span>
        ) : null}
      </div>
    </header>
  );
}
