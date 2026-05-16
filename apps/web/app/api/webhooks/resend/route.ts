import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

const TOLERANCE_SECONDS = 5 * 60;

interface VerifyResult {
  ok: boolean;
  reason?: string;
}

/**
 * Verify a Resend / Svix-signed webhook payload.
 *
 * Resend signs webhooks via Svix. Headers:
 *   svix-id          — unique message id
 *   svix-timestamp   — seconds since epoch
 *   svix-signature   — one or more `v1,<base64>` signatures (space-separated)
 *
 * The signature is HMAC-SHA256 over `<svix-id>.<svix-timestamp>.<rawBody>`
 * keyed by the base64-decoded signing secret (with the `whsec_` prefix stripped).
 *
 * Reject if the timestamp is more than 5 minutes from now (replay protection).
 */
export function verifyResendSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  now: () => number = () => Math.floor(Date.now() / 1000),
): VerifyResult {
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, reason: 'missing svix headers' };
  }

  const ts = Number.parseInt(headers.timestamp, 10);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'invalid timestamp' };
  const skew = Math.abs(now() - ts);
  if (skew > TOLERANCE_SECONDS) {
    return { ok: false, reason: 'timestamp outside tolerance window' };
  }

  const secretBytes = decodeSigningSecret(secret);
  if (!secretBytes) return { ok: false, reason: 'invalid signing secret' };

  const signedPayload = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = createHmac('sha256', secretBytes).update(signedPayload).digest('base64');

  // Header may contain multiple "v1,<sig>" pairs separated by spaces; accept any match.
  const candidates = headers.signature
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('v1,'))
    .map((part) => part.slice(3));
  if (candidates.length === 0) return { ok: false, reason: 'no v1 signature' };

  for (const candidate of candidates) {
    if (constantTimeBase64Eq(candidate, expected)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: 'signature mismatch' };
}

function decodeSigningSecret(secret: string): Buffer | null {
  // Svix secrets look like `whsec_<base64>`. Accept either form.
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  try {
    const buf = Buffer.from(raw, 'base64');
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

function constantTimeBase64Eq(a: string, b: string): boolean {
  let bufA: Buffer;
  let bufB: Buffer;
  try {
    bufA = Buffer.from(a, 'base64');
    bufB = Buffer.from(b, 'base64');
  } catch {
    return false;
  }
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

interface WebhookEvent {
  type?: string;
  data?: { to?: string | string[]; email_id?: string };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Missing secret in production is a misconfiguration; we refuse rather
    // than silently accepting, which would let any unsigned payload through.
    return NextResponse.json(
      { error: 'RESEND_WEBHOOK_SECRET not configured' },
      { status: 401 },
    );
  }

  const rawBody = await req.text();
  const verification = verifyResendSignature(rawBody, {
    id: req.headers.get('svix-id'),
    timestamp: req.headers.get('svix-timestamp'),
    signature: req.headers.get('svix-signature'),
  }, secret);
  if (!verification.ok) {
    return NextResponse.json(
      { error: 'invalid signature', reason: verification.reason },
      { status: 401 },
    );
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody) as WebhookEvent;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  switch (event.type) {
    case 'email.bounced':
    case 'email.complained': {
      const to = Array.isArray(event.data?.to) ? event.data?.to[0] : event.data?.to;
      console.warn(
        `[email:bounce] type=${event.type} to=${to ?? '(unknown)'} email_id=${event.data?.email_id ?? '(unknown)'}`,
      );
      break;
    }
    default:
      // delivered / opened / clicked / etc. — ignored for MVP
      break;
  }
  return NextResponse.json({ ok: true });
}
