'use client';

import { useChapterEvents } from '@/lib/sse-client';

/**
 * Mount point for the per-session SSE consumer (PLAN-018 Q-PLN-01 Track D).
 *
 * Rendered at the AppShell layer (inside `<TRPCProvider>` so the React
 * Query client is in scope) — exactly one instance per session. Per-page
 * mounting would leak EventSources on Next.js route navigation; per-app
 * mounting matches the EventSource lifecycle to the page lifecycle.
 *
 * Only renders for signed-in users — the SSE route returns 401 for
 * anonymous requests anyway, but skipping the mount avoids a benign
 * EventSource reconnect loop on the login screen.
 */
export function RealtimeProvider({
  signedIn,
}: {
  signedIn: boolean;
}) {
  if (!signedIn) return null;
  return <RealtimeMount />;
}

function RealtimeMount() {
  useChapterEvents();
  return null;
}
