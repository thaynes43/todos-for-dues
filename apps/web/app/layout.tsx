import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getServerSession, getSessionRole } from '@app/auth';
import type { Role } from '@app/db/schema';
import { getMemberCapabilities } from '@/lib/access';
import { TRPCProvider } from '@/lib/trpc-provider';
import { ChapterHeader } from '@/components/ChapterHeader';
import { RoleAwareNav, type NavCapabilities } from '@/components/RoleAwareNav';
import { Footer } from '@/components/Footer';
import { RealtimeProvider } from '@/components/RealtimeProvider';
import './globals.css';

// TODO(tom): "Sigo Dues" is the working name under Sigo Alumni branding —
// confirm or rename (modernization plan §P3 flags this as your call).
export const metadata: Metadata = {
  title: {
    default: 'Sigo Dues',
    template: '%s · Sigo Dues',
  },
  description: 'Chapter jobs that count toward dues.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(await headers());
  let role: Role | null = null;
  let displayName: string | null = null;
  let caps: NavCapabilities | null = null;
  if (session?.user?.id) {
    const sessionRole = await getSessionRole(session.user.id);
    role = sessionRole.role;
    displayName = sessionRole.displayName;
    // ADR-015: nav visibility of post/claim surfaces keys on member STATUS.
    const c = await getMemberCapabilities(session.user.id);
    caps = { canPost: c.canPost, canClaim: c.canClaim };
  }

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-stone-50 text-stone-900 antialiased dark:bg-stone-950 dark:text-stone-100">
        <TRPCProvider>
          <RealtimeProvider signedIn={Boolean(session?.user?.id)} />
          <ChapterHeader displayName={displayName} />
          <RoleAwareNav role={role} caps={caps} />
          <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
            {children}
          </main>
          <Footer />
        </TRPCProvider>
      </body>
    </html>
  );
}
