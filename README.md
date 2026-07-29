# ZsanillaBox — Alapanyag-készletkezelő

Webes rendszer, ami nyilvántartja az alapanyagok készletét, minden Shopify-rendelésnél
automatikusan levonja a felhasznált mennyiséget a termék receptje alapján, kiszámolja,
mikor és mennyit kell újrarendelni, és naponta egy összesítő emailt küld arról, miből
kell rendelni.

**Tech:** Next.js 15 (App Router) · TypeScript · PostgreSQL + Prisma · Tailwind CSS ·
Resend (email) · Recharts (grafikon)

---

## 1. Gyors indulás

A rendszer PostgreSQL-t használ. Két út közül választhatsz: a **helyi** adatbázissal
azonnal kipróbálhatod regisztráció nélkül, az **éles** használathoz felhős adatbázis kell.

### 1.A Helyi kipróbálás (regisztráció nélkül)

A projekt tartalmaz egy beágyazott Postgres-t, ami a saját gépeden fut. A `.env` alapból
már erre mutat, tehát csak indítanod kell.

```bash
npm install
```

Egy terminálban hagyd futni az adatbázist:

```bash
npm run db:local
```

Egy másik terminálban:

```bash
npm run db:deploy
```

```bash
npm run db:seed
```

```bash
npm run dev
```

A felület a http://localhost:3000 címen nyílik, mintaadatokkal feltöltve.

> A `db:seed` kitalált alapanyagokat, három ZsanillaBox terméket és 90 nap
> fogyástörténetet tölt fel. **Éles indulás előtt töröld** — a valós adatokat üres
> adatbázisra vidd fel.

### 1.B Éles adatbázis (felhő)

1. Regisztrálj a [neon.tech](https://neon.tech) oldalon (vagy Supabase / Railway — mindegy).
2. Hozz létre egy projektet, régiónak jó az **EU Central**.
3. Másold ki a *Connection string* értéket, és írd be a `.env` fájlba. Két változó kell:
   a **pooled** string az alkalmazásnak, a **direct** a migrációknak (részletek az
   5.1 pontban):

```
DATABASE_URL="postgresql://user:jelszo@ep-xyz-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://user:jelszo@ep-xyz.eu-central-1.aws.neon.tech/neondb?sslmode=require"
```

4. Futtasd: `npm run db:deploy`

A többi értéket (Shopify, Resend) később is pótolhatod — a felület nélkülük is működik.
A `.env.example` fájl minden változót elmagyaráz.

> **Figyelem:** a helyi adatbázis a `data/` mappában él, és nem része a deploynak. Ami
> abban van, az csak a te gépeden létezik.

---

## 2. Az adatfeltöltés helyes sorrendje

Ez a sorrend nem cserélhető fel — az import a receptek nélkül nem tud mit kezdeni a
rendelésekkel.

1. **Alapanyagok** (`/alapanyagok`) — minden fonal, biztonsági szem, tömőanyag, tű, doboz.
   Add meg a **jelenlegi készletet**, a **beszállítót** és az **átfutási időt** (hány nap
   a megrendeléstől a beérkezésig).
2. **Termékek + receptek** (`/termekek`) — minden ZsanillaBox termékhez vidd fel, hogy
   **egy darabhoz** miből mennyi kell. A Shopify termék-azonosítót is add meg (lásd 3.1).
3. **Shopify történeti import** — a múltbeli rendelésekből tölti fel a fogyásnaplót,
   ebből számol a rendszer napi átlagfogyást:

   ```bash
   npm run import:shopify -- ./imports/orders_export.csv --dry-run
   ```

   A `--dry-run` először csak megmutatja, mit találna, és kiírja, mely termékeket nem
   tudta párosítani. Ha rendben a lista, futtasd a kapcsoló nélkül.

   > Az import **nem nyúl a jelenlegi készlethez** — a mai készletből nem szabad még
   > egyszer levonni a múltbeli rendeléseket. (Ha a felvitt készlet a történeti időszak
   > *eleji* állapot, akkor használd az `--apply-stock` kapcsolót.)

4. **Beállítások** (`/beallitasok`) — tartaléknapok (javasolt: 14), fogyás-ablak
   (javasolt: 60 nap), riasztás-szünet (javasolt: 4 nap).

### A Shopify export letöltése

Shopify admin → **Orders** → jobb felül **Export** → *All orders* / kívánt időszak →
**CSV for Excel, Numbers…**. A kapott fájlt tedd az `imports/` mappába.

---

## 3. Shopify integráció

### 3.1 Custom app létrehozása

1. Shopify admin → **Settings → Apps and sales channels → Develop apps → Create an app**
2. **Configure Admin API scopes** → engedélyezd: `read_orders`, `read_products`
3. **Install app** → másold ki az **Admin API access token**-t (`shpat_…`)
4. Az **API secret key** értékét is másold ki — ezzel ellenőrizzük a webhookok aláírását

A `.env`-be:

```
SHOPIFY_SHOP_DOMAIN="zsanillabox.myshopify.com"
SHOPIFY_ADMIN_ACCESS_TOKEN="shpat_..."
SHOPIFY_WEBHOOK_SECRET="<API secret key>"
APP_URL="https://<a-deployolt-cimed>"
```

> A `SHOPIFY_WEBHOOK_SECRET` nélkül a rendszer **minden** bejövő webhookot elutasít.
> Ez szándékos: aláírás-ellenőrzés nélkül bárki hamisíthatna készletmozgást.

### 3.2 A termék-azonosítók összekötése

A webhook a Shopify `product_id` alapján találja meg a receptet. Az azonosítót a Shopify
adminban a termék URL-jének végén látod:
`…/admin/products/**9412563987456**` → ezt írd a termék *Shopify termék-azonosító*
mezőjébe. Amelyik terméknél ez hiányzik, arról a Termékek oldal figyelmeztet.

### 3.3 Webhook regisztráció

Deploy után (lásd 5. pont):

```bash
npm run shopify:register-webhook
```

Ez az `orders/create` és `orders/cancelled` eseményeket regisztrálja a
`<APP_URL>/api/webhooks/shopify/orders` címre. A már meglévő regisztrációt nem duplikálja.

Kézzel is beállítható: Shopify admin → **Settings → Notifications → Webhooks**.

---

## 4. Email riasztás

1. Regisztrálj a [resend.com](https://resend.com) oldalon, hozz létre egy API kulcsot.
2. A `.env`-be:

```
RESEND_API_KEY="re_..."
ALERT_EMAIL_FROM="ZsanillaBox Készlet <onboarding@resend.dev>"
ALERT_EMAIL_TO="sajtizsanett@gmail.com"
```

Saját domainnel szebb feladó is beállítható (Resend → Domains), de a kezdéshez az
`onboarding@resend.dev` is jó.

Kipróbálás küldés nélkül — a Beállítások oldal *Riasztás próbafutása* gombjával, vagy:

```bash
npm run alert:daily -- --dry-run
```

**Duplikáció elkerülése:** ha egy alapanyagról ment riasztás, a beállított
riasztás-szünetig (alapból 4 nap) nem szól újra — **kivéve**, ha közben tovább csökkent a
készlete, vagy ha új alapanyag került a listára. Ilyenkor a teljes aktuális lista megy ki,
hogy egyben lásd, miből kell rendelni.

---

## 5. Élesítés: GitHub + Vercel

### 5.1 Adatbázis (Neon)

Vercelen szerver nélküli függvények futnak: minden kérés új adatbázis-kapcsolatot nyitna,
és a Neon ingyenes csomagja hamar elfogyna. Ezért **kétféle** kapcsolati stringre van
szükség — a Neon mindkettőt megadja ugyanazon a képernyőn:

| Változó | Melyik stringet | Mire kell |
|---|---|---|
| `DATABASE_URL` | a **pooled** (a hostban `-pooler`) | az alkalmazás futása |
| `DIRECT_URL` | a **direct** (nincs benne `-pooler`) | a migrációk |

A `DATABASE_URL` végére tedd oda: `&pgbouncer=true&connection_limit=1`.

### 5.2 Feltöltés GitHubra

A projekt már inicializált git repó egy kezdő commit-tal. Hozz létre egy **privát** repót a
[github.com/new](https://github.com/new) oldalon (ne adj hozzá README-t), majd:

```bash
git remote add origin https://github.com/<felhasznalonev>/zsanillabox-keszletkezelo.git
```

```bash
git push -u origin main
```

> A `.env` fájl **nincs** feltöltve (a `.gitignore` kizárja) — a titkok csak a Vercel
> felületén élnek.

### 5.3 Vercel projekt

1. [vercel.com/new](https://vercel.com/new) → importáld a GitHub repót.
2. A framework automatikusan **Next.js** lesz — ezt hagyd úgy.
3. **Environment Variables** — vidd fel ezeket (mind a három környezetre):

   ```
   DATABASE_URL              a Neon pooled stringje
   DIRECT_URL                a Neon direct stringje
   SHOPIFY_SHOP_DOMAIN       zsanillabox.myshopify.com
   SHOPIFY_ADMIN_ACCESS_TOKEN  shpat_...
   SHOPIFY_WEBHOOK_SECRET    a custom app API secret key-e
   RESEND_API_KEY            re_...
   ALERT_EMAIL_FROM          ZsanillaBox Készlet <onboarding@resend.dev>
   ALERT_EMAIL_TO            sajtizsanett@gmail.com
   CRON_SECRET               hosszú véletlen string
   ADMIN_PASSWORD            a felület jelszava
   APP_URL                   (a deploy után töltsd ki)
   ```

4. **Deploy.** A build a `vercel.json`-ból fut, és a `prisma migrate deploy` is része —
   tehát az adatbázis-táblák maguktól létrejönnek, nem kell külön migrálni.
5. A kapott cím (pl. `https://zsanillabox-keszletkezelo.vercel.app`) kerüljön az `APP_URL`
   változóba, majd indíts egy **Redeploy**-t.

### 5.4 Napi email a Vercel cronnal

Az ütemezés már be van állítva a [vercel.json](vercel.json) fájlban:

```json
{ "path": "/api/cron/daily", "schedule": "0 6 * * *" }
```

A Vercel a cron-hívásokhoz **automatikusan** hozzáteszi az `Authorization: Bearer
<CRON_SECRET>` fejlécet, ha a `CRON_SECRET` változó be van állítva — az endpoint pontosan
ezt várja, tehát nincs más teendőd.

Két dolgot érdemes tudni:

- **A cron UTC szerint jár.** A `0 6 * * *` nyári időszámításban 8:00, télen 7:00 magyar
  idő szerint. Ha fix 8:00-t szeretnél télen is, váltsd `0 7 * * *`-ra.
- **Hobby csomagon napi egy futás engedélyezett**, és az indítás az adott órán belül
  csúszhat. A napi összesítőnek ez bőven elég.

Kézzel bármikor kiváltható:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://<APP_URL>/api/cron/daily?dryRun=1
```

### 5.5 Admin jelszó

Élesben mindenképp állítsd be az `ADMIN_PASSWORD` változót. Ezután a felület böngészőből
csak jelszóval nyílik (a felhasználónevet hagyd üresen). A Shopify webhook és a cron
endpoint szándékosan kimarad ebből — azoknak saját hitelesítésük van (HMAC aláírás,
illetve bearer token).

---

## 6. Hogyan számol a rendszer

```
napi_átlagfogyás  = (fogyás-ablakban felhasznált összmennyiség) / fogyás-ablak napjai

rendelési_pont    = napi_átlagfogyás × átfutási_idő + biztonsági_puffer

ha készlet <= rendelési_pont:
    javasolt_rendelés = napi_átlagfogyás × (átfutási_idő + tartaléknapok)
                        + biztonsági_puffer − jelenlegi_készlet
```

- A napi átlagot a **teljes ablakkal** osztjuk, nem csak a fogyásos napokkal — különben egy
  hetente egyszer fogyó alapanyag hétszeres túlbecslést kapna.
- A *rendelési egység* mezővel felfelé kerekítünk (ha pl. csak 10-esével lehet rendelni).
- A dashboard jelzései: **piros** = elérte a rendelési pontot · **sárga** = a rendelési
  pont 30%-os sávjában · **zöld** = rendben.

---

## 7. Parancsok

| Parancs | Mit csinál |
|---|---|
| `npm run dev` | Fejlesztői szerver indítása |
| `npm run build` / `npm start` | Éles build és futtatás |
| `npm test` | Teljes teszt-csomag (87 teszt, saját beágyazott Postgres-szel) |
| `npm run db:local` | Helyi Postgres indítása fejlesztéshez (a `data/` mappában tárol) |
| `npm run db:deploy` | Migrációk futtatása |
| `npm run db:studio` | Adatbázis böngészése |
| `npm run db:seed` | Mintaadat feltöltése |
| `npm run import:shopify -- <fájl.csv>` | Történeti rendelés-import |
| `npm run recalc` | Átlagfogyás és rendelési pontok újraszámolása |
| `npm run alert:daily -- --dry-run` | A riasztó email próbafutása |
| `npm run shopify:register-webhook` | Shopify webhookok regisztrálása |

---

## 8. Hibaelhárítás

**„Az adatbázis még nincs beállítva” a felületen**
A `DATABASE_URL` hiányzik vagy hibás a `.env`-ben. Ellenőrizd, hogy a string végén ott
van-e a `?sslmode=require`.

**A Shopify-rendelés nem vonja le a készletet**
Nézd meg sorban: (1) a terméknek van-e *Shopify termék-azonosítója*, (2) van-e receptje,
(3) a `SHOPIFY_WEBHOOK_SECRET` az **API secret key** értéke-e. A Termékek oldal az első
kettőt magától jelzi. A webhook naplója a hosting szolgáltató logjában látszik.

**Nem jön az email**
Futtasd a próbafutást (`npm run alert:daily -- --dry-run`). Ha az azt írja, hogy nincs
rendelési pont alatti alapanyag, akkor nincs is mit küldeni. Ha van, de mégsem megy ki,
a Beállítások oldal *Kapcsolatok állapota* panelje megmutatja, melyik érték hiányzik.

**Az import kétszer futott**
A `--replace` kapcsolóval újraimportálható: a korábbi *import* forrású sorokat törli, a
Shopify-webhookból és a kézi korrekciókból származó sorokhoz nem nyúl.

---

## 9. Projektstruktúra

```
prisma/schema.prisma          adatmodell
prisma/migrations/            SQL migrációk
prisma/seed.ts                mintaadat

src/lib/reorder.ts            a számítási logika (tiszta függvények)
src/lib/inventory.ts          adatbázis-műveletek: levonás, újraszámolás, áttekintés
src/lib/shopify.ts            webhook HMAC-ellenőrzés és rendelés-értelmezés
src/lib/shopify-csv.ts        a történeti export feldolgozása
src/lib/alerts.ts             a napi riasztás folyamata
src/lib/email.ts              Resend integráció és email-sablon

src/app/                      admin felület (magyar nyelvű)
src/app/api/webhooks/…        Shopify webhook endpoint
src/app/api/cron/daily        a napi riasztás endpointja
src/middleware.ts             admin jelszavas védelem

scripts/                      CLI eszközök (import, recalc, riasztás, webhook regisztráció)
```
