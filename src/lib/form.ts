/**
 * FormData olvasó segédfüggvények.
 *
 * A számoknál szándékosan elfogadjuk a magyar tizedesvesszőt is ("1,5"), mert
 * a felhasználó azt fogja beírni, és egy néma NaN a készletadatban súlyos hiba.
 */

export class FormError extends Error {}

export function str(fd: FormData, key: string, label = key): string {
  const value = fd.get(key);
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new FormError(`A(z) „${label}” mező kitöltése kötelező.`);
  return text;
}

export function optStr(fd: FormData, key: string): string | null {
  const value = fd.get(key);
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

function parseNumber(raw: string): number {
  // "1 234,5" → "1234.5"
  const normalized = raw.replace(/\s/g, '').replace(',', '.');
  return Number(normalized);
}

export function num(fd: FormData, key: string, fallback = 0, label = key): number {
  const value = fd.get(key);
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return fallback;
  const parsed = parseNumber(text);
  if (!Number.isFinite(parsed)) throw new FormError(`A(z) „${label}” mezőbe számot írj.`);
  return parsed;
}

export function nonNegativeNum(fd: FormData, key: string, fallback = 0, label = key): number {
  const parsed = num(fd, key, fallback, label);
  if (parsed < 0) throw new FormError(`A(z) „${label}” nem lehet negatív.`);
  return parsed;
}

export function int(fd: FormData, key: string, fallback = 0, label = key): number {
  const parsed = num(fd, key, fallback, label);
  return Math.round(parsed);
}

export function optInt(fd: FormData, key: string, label = key): number | null {
  const value = fd.get(key);
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  return int(fd, key, 0, label);
}

export function bool(fd: FormData, key: string): boolean {
  const value = fd.get(key);
  return value === 'on' || value === 'true' || value === '1';
}

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** A Next.js a redirect()/notFound() hívásokat dobott hibaként valósítja meg. */
function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown })?.digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_');
}

/** Egységes hibakezelés a server action-ökhöz: a FormError üzenetét adjuk vissza. */
export async function runAction(fn: () => Promise<string | void>): Promise<ActionResult> {
  try {
    const message = await fn();
    return { ok: true, message: message ?? undefined };
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    if (error instanceof FormError) return { ok: false, error: error.message };
    console.error(error);
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Nem sikerült menteni: ${detail}` };
  }
}
