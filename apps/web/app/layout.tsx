import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getServerSession, getSessionRole } from '@app/auth';
import type { Role } from '@app/db/schema';
import { TRPCProvider } from '@/lib/trpc-provider';
import { ChapterHeader } from '@/components/ChapterHeader';
import { RoleAwareNav } from '@/components/RoleAwareNav';
import { Footer } from '@/components/Footer';
import './globals.css';

export const metadata: Metadata = {
  title: 'TODOs for Dues',
  description: 'Per-chapter Greek-life dues-credit job board.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(await headers());
  let role: Role | null = null;
  let displayName: string | null = null;
  if (session?.user?.id) {
    const sessionRole = await getSessionRole(session.user.id);
    role = sessionRole.role;
    displayName = sessionRole.displayName;
  }

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-background text-foreground">
        <TRPCProvider>
          <ChapterHeader displayName={displayName} />
          <RoleAwareNav role={role} />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
            {children}
          </main>
          <Footer />
        </TRPCProvider>
      </body>
    </html>
  );
}
