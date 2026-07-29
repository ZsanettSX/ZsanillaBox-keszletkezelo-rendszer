import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { runDailyAlert } from '@/lib/alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A napi futás újraszámol minden alapanyagot és emailt küld; a 10 másodperces
// alapértelmezés hideg adatbázis mellett kevés lehet.
export const maxDuration = 60;

/** Időzítés-független összehasonlítás, hogy a titok ne legyen kitalálható. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const queryToken = new URL(request.url).searchParams.get('token') ?? '';

  return (
    (bearer.length > 0 && secretMatches(bearer, expected)) ||
    (queryToken.length > 0 && secretMatches(queryToken, expected))
  );
}

async function handle(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'A CRON_SECRET nincs beállítva, ezért az endpoint le van tiltva.' },
      { status: 500 },
    );
  }
  if (!authorize(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';

  try {
    const result = await runDailyAlert({ dryRun });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[cron/daily] Hiba a riasztás futtatásakor:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
