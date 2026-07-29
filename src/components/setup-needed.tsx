/**
 * Ha az adatbázis nem elérhető, a nyers Prisma stack trace helyett
 * lépésről lépésre megmondjuk, mit kell beállítani.
 */
export function SetupNeeded({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className="card mx-auto max-w-2xl p-6">
      <h1 className="text-lg font-semibold text-slate-900">Az adatbázis még nincs beállítva</h1>
      <p className="mt-2 text-sm text-slate-600">
        A rendszer működéséhez egy PostgreSQL adatbázis kell. Ingyenes és 2 perc alatt kész:
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>
          Regisztrálj a{' '}
          <a
            href="https://neon.tech"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-rose-600 underline"
          >
            neon.tech
          </a>{' '}
          oldalon, és hozz létre egy projektet (régiónak jó az EU Central).
        </li>
        <li>
          Másold ki a <em>Connection string</em> értéket (így néz ki:{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">postgresql://…</code>).
        </li>
        <li>
          Illeszd be a projekt gyökerében lévő <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">.env</code>{' '}
          fájlba a <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">DATABASE_URL</code> sorba.
        </li>
        <li>
          Futtasd a terminálban:{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">npm run db:deploy</code>, majd
          (ha kérsz mintaadatot) <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">npm run db:seed</code>.
        </li>
        <li>Frissítsd ezt az oldalt.</li>
      </ol>
      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-slate-500">Technikai hibaüzenet</summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
          {message}
        </pre>
      </details>
    </div>
  );
}
