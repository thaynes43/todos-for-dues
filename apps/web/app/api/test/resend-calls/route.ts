import { NextResponse } from 'next/server';
import { clearRecordedEmails, getRecordedEmails } from '@app/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PLAN-008 Trap 7 — out-of-process Playwright Resend assertions. The route
// returns 404 unless `RESEND_TEST_MODE === 'true'`, so the surface area is
// invisible to any production request matrix.
//
// (Lives at `/api/test/resend-calls` rather than the originally-planned
// `/api/_test/...`: Next.js 16 treats `_`-prefixed folders as private and
// opts them out of routing entirely, which makes the route unreachable.)
function testModeEnabled(): boolean {
  // AUDIT-2026-08: double-gate — the env flag AND a non-production runtime.
  // One misconfigured env var must never expose recorded email PII in prod.
  return (
    process.env.RESEND_TEST_MODE === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
}

export async function GET(): Promise<Response> {
  if (!testModeEnabled()) return new Response(null, { status: 404 });
  return NextResponse.json(getRecordedEmails());
}

export async function DELETE(): Promise<Response> {
  if (!testModeEnabled()) return new Response(null, { status: 404 });
  clearRecordedEmails();
  return new Response(null, { status: 204 });
}
