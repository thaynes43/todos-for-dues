import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return NextResponse.json(
    { status: 'stub', version: process.env.APP_VERSION ?? 'dev', db: false },
    { status: 200 },
  );
}
