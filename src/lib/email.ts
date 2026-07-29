import { Resend } from 'resend';
import type { DashboardRow } from './inventory';
import { formatQty, formatQtyWithUnit } from './format';

export type AlertEmail = { subject: string; html: string; text: string };

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * A riasztó email összeállítása.
 *
 * Szándékosan táblázatos, inline stílusokkal: a levelezők (Gmail, Outlook)
 * kidobják a <style> blokkot és nem támogatják a modern layoutot.
 */
export function buildAlertEmail(rows: DashboardRow[], appUrl: string): AlertEmail {
  const today = new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const subject =
    rows.length === 1
      ? `ZsanillaBox készlet: 1 alapanyagból rendelni kell`
      : `ZsanillaBox készlet: ${rows.length} alapanyagból rendelni kell`;

  const bySupplier = new Map<string, DashboardRow[]>();
  for (const row of rows) {
    const key = row.supplierName ?? 'Nincs megadva beszállító';
    const list = bySupplier.get(key);
    if (list) list.push(row);
    else bySupplier.set(key, [row]);
  }

  const cell = 'padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;';
  const headCell =
    'padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:12px;' +
    'text-transform:uppercase;letter-spacing:0.04em;color:#64748b;text-align:left;';

  const tables = [...bySupplier.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'hu'))
    .map(([supplier, items]) => {
      const body = items
        .map(
          (row) => `
            <tr>
              <td style="${cell}"><strong>${escapeHtml(row.name)}</strong></td>
              <td style="${cell}text-align:right;">${escapeHtml(formatQtyWithUnit(row.currentStock, row.unit))}</td>
              <td style="${cell}text-align:right;color:#64748b;">${escapeHtml(formatQty(row.reorderPoint))}</td>
              <td style="${cell}text-align:right;font-weight:600;color:#0f172a;">${escapeHtml(
                formatQtyWithUnit(row.suggestedOrder, row.unit),
              )}</td>
            </tr>`,
        )
        .join('');

      return `
        <h3 style="margin:24px 0 8px;font-size:15px;color:#0f172a;">${escapeHtml(supplier)}</h3>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
               style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <thead>
            <tr>
              <th style="${headCell}">Alapanyag</th>
              <th style="${headCell}text-align:right;">Jelenlegi készlet</th>
              <th style="${headCell}text-align:right;">Rendelési pont</th>
              <th style="${headCell}text-align:right;">Javasolt rendelés</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="hu">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
      <h1 style="margin:0 0 4px;font-size:18px;color:#0f172a;">Alapanyag-rendelési emlékeztető</h1>
      <p style="margin:0 0 16px;font-size:14px;color:#64748b;">${escapeHtml(today)} — ${rows.length} alapanyag érte el a rendelési pontot.</p>
      ${tables}
      <p style="margin:24px 0 0;font-size:13px;color:#64748b;">
        A javasolt mennyiség az átfutási idő + tartaléknapok fogyását fedezi.
        <a href="${escapeHtml(appUrl)}" style="color:#e11d48;">Részletek a készletkezelőben →</a>
      </p>
    </div>
  </body>
</html>`;

  const text = [
    `Alapanyag-rendelési emlékeztető — ${today}`,
    '',
    ...rows.map(
      (row) =>
        `• ${row.name}: készlet ${formatQtyWithUnit(row.currentStock, row.unit)}, ` +
        `rendelési pont ${formatQty(row.reorderPoint)}, ` +
        `javasolt rendelés ${formatQtyWithUnit(row.suggestedOrder, row.unit)}` +
        (row.supplierName ? ` — ${row.supplierName}` : ''),
    ),
    '',
    appUrl,
  ].join('\n');

  return { subject, html, text };
}

export type SendResult = { sent: boolean; reason?: string; id?: string };

/** Email küldése Resenden keresztül. Hiányzó konfiguráció nem hiba, csak kihagyás. */
export async function sendAlertEmail(email: AlertEmail): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_EMAIL_FROM;
  const to = (process.env.ALERT_EMAIL_TO ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!apiKey) return { sent: false, reason: 'Nincs beállítva RESEND_API_KEY.' };
  if (!from) return { sent: false, reason: 'Nincs beállítva ALERT_EMAIL_FROM.' };
  if (to.length === 0) return { sent: false, reason: 'Nincs beállítva ALERT_EMAIL_TO.' };

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  if (error) throw new Error(`Resend hiba: ${error.message}`);
  return { sent: true, id: data?.id };
}
