import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { NavLink } from '@/components/nav-link';

export const metadata: Metadata = {
  title: 'ZsanillaBox — Készletkezelő',
  description: 'Alapanyag-készlet és újrarendelés nyilvántartás',
};

const NAV = [
  { href: '/', label: 'Áttekintés' },
  { href: '/bevetelezes', label: 'Bevételezés' },
  { href: '/alapanyagok', label: 'Alapanyagok' },
  { href: '/termekek', label: 'Termékek & receptek' },
  { href: '/fogyas', label: 'Fogyás' },
  { href: '/statisztika', label: 'Statisztika' },
  { href: '/beallitasok', label: 'Beállítások' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hu">
      <body>
        <div className="min-h-full">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
              <Link href="/" className="text-base font-semibold text-slate-900">
                Zsanilla<span className="text-rose-600">Box</span>
                <span className="ml-2 text-sm font-normal text-slate-500">Készletkezelő</span>
              </Link>
              <nav className="flex flex-wrap items-center gap-1">
                {NAV.map((item) => (
                  <NavLink key={item.href} href={item.href}>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
