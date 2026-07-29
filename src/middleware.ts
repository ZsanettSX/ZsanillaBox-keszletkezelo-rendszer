import { NextResponse, type NextRequest } from 'next/server';

/**
 * Egyszerű HTTP Basic védelem az admin felületre.
 *
 * Az `ADMIN_PASSWORD` üresen hagyva nincs védelem — ez csak helyi fejlesztéshez jó,
 * élesben mindig állítsd be.
 *
 * A gépi végpontok (Shopify webhook, cron) szándékosan ki vannak zárva: azoknak
 * saját, erősebb hitelesítésük van (HMAC, illetve bearer token), és a Shopify nem
 * tudna Basic auth fejlécet küldeni.
 */
export function middleware(request: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected) return NextResponse.next();

  const header = request.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const separator = decoded.indexOf(':');
      const provided = separator === -1 ? decoded : decoded.slice(separator + 1);
      if (constantTimeEquals(provided, expected)) return NextResponse.next();
    } catch {
      // Hibás base64 — kezeljük úgy, mintha nem lenne hitelesítés.
    }
  }

  return new NextResponse('Hitelesítés szükséges.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="ZsanillaBox keszletkezelo", charset="UTF-8"' },
  });
}

/**
 * A hosszkülönbség itt is kiderül, de a tartalom byte-onkénti kitalálása nem
 * gyorsítható a válaszidőből. (Az Edge runtime-ban nincs timingSafeEqual.)
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  matcher: ['/((?!api/webhooks|api/cron|_next/static|_next/image|favicon.ico).*)'],
};
