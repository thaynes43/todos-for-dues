import Link from 'next/link';

export function ChapterHeader({ displayName }: { displayName?: string | null }) {
  return (
    <header className="border-b border-stone-200 px-6 py-3 dark:border-stone-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5">
          {/* Crest mark — canonical asset from sigoalumni-org (docs/brand). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-mark.svg"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8"
          />
          {/* TODO(tom): working name — see layout.tsx metadata note. */}
          <span className="text-lg font-semibold tracking-tight">Sigo Dues</span>
        </Link>
        {displayName ? (
          <span className="truncate text-sm opacity-70">
            Signed in as{' '}
            <strong className="font-semibold opacity-100">{displayName}</strong>
          </span>
        ) : null}
      </div>
    </header>
  );
}
