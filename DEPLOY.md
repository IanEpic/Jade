# JADE Node.js — Deployment Notes

## Server requirements

- Node.js 20+
- SQL Server (existing Jade DB — no schema changes needed beyond the migrations listed below)
- ffmpeg on PATH (or set `FFMPEG_PATH` in `.env`)
- SMTP relay accessible from the server IP

---

## First deploy

### 1. Clone & install

```bash
git clone <repo> jade
cd jade
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in all values:

```
NODE_ENV=production
PORT=3000
BASE_URL=https://yourdomain.com

DB_HOST=
DB_NAME=
DB_USER=
DB_PASS=

SESSION_SECRET=<random 64-char string>

MAIL_HOST=
MAIL_PORT=25
SYSTEM_EMAIL=
SENDER_EMAIL=

WWWREF_ROOT=        # path to legacy Apache wwwref folder
TEMPLATE_ROOT=      # path to folder containing per-program HTML shells
FILESTORE_ROOT=     # path to file/image/video store (NAS or local)

ANTHROPIC_API_KEY=  # only needed for AI comment-check feature
```

### 3. Build static assets

```bash
npm run build
```

This runs:
- `stylus src/styles/main.styl --out public/css` — compiles CSS
- `esbuild src/js/*.js --minify --outdir=public/js` — minifies JS

`public/css/` and `public/js/` are gitignored (build outputs). Run `npm run build` after every deploy.

> **Note:** `sortable.min.js` is copied from `node_modules` into `public/js/` automatically at app startup — no manual step needed.

### 4. Run database migrations

Run these against the production DB in order. Check `migrations/migration_log.md` for full details.

| # | SQL |
|---|-----|
| 011 | `ALTER TABLE JudgingModel ADD commentguidelines TEXT` |
| 012 | `ALTER TABLE UserCredential ADD mustchangepassword BIT NOT NULL DEFAULT 0` |
| 013 | `ALTER TABLE UserCredential ADD activated BIT NOT NULL DEFAULT 1; ALTER TABLE UserCredential ADD activationtoken VARCHAR(64) NULL` |
| 014 | `ALTER TABLE CategoryQuestionLink ADD orda INT NULL` then populate with ROW_NUMBER (see migration_log.md) |
| 015 | Populate `orda` on `CategoryEligibilityLink` (column already exists) |
| 019 | `ALTER TABLE Category ADD adminonly BIT NOT NULL DEFAULT 0` |
| 020 | `ALTER TABLE Program ADD scorereadydefault BIT NOT NULL DEFAULT 0, finalistreviewdefault BIT NOT NULL DEFAULT 0, wildcarddecisiondefault BIT NOT NULL DEFAULT 0, winnernominationdefault BIT NOT NULL DEFAULT 0` |

#### One-time data fixes

**Lock cost on already-invoiced entries** (prevents live category price showing on old invoices):
```sql
UPDATE Entry
SET Entry.costex = Category.costex,
    Entry.gst    = Category.gst
FROM Entry
INNER JOIN Category ON Entry.categoryid = Category.categoryid
WHERE Entry.invoiceid IS NOT NULL
  AND Entry.deleted   = 0
  AND Entry.costex    IS NULL
```

**Strip `.cgi` from TopMenuButton URLs** (Perl used `.cgi` extensions; Node doesn't):
```sql
-- Review first
SELECT * FROM TopMenuButton WHERE url LIKE '%.cgi%'

-- Then fix
UPDATE TopMenuButton SET url = REPLACE(url, '.cgi', '') WHERE url LIKE '%.cgi%'
```

Also check rich-text fields (loginpagetext, standardwelcometext, etc.) for any hardcoded `.cgi` links.

### 5. Apache / wwwref changes

- **Migration 017:** Remove `<div id='decoration'></div>` from the 7 `login_eventawards*.html` shell templates in the Apache `cgi-bin/design/` folder.
- **Migration 018:** In each `style_sheet_eventawards20XX.css` (7 files in wwwref), change button style: `text-transform: none; border: 0; border-radius: 0;` → add `border-radius: 4px`.

### 6. Start the app

```bash
npm start
```

Or via PM2 / your node daemon of choice. Point your reverse proxy (Apache/nginx) at `http://localhost:3000`.

---

## Subsequent deploys

```bash
git pull
npm install        # if package.json changed
npm run build      # always — rebuilds CSS and JS
npm start          # restart the node process
```

---

## Per-program go-live checklist

For each program being switched from Perl to Node:

- [ ] Run TopMenuButton `.cgi` URL fix (see above)
- [ ] Set `smtpserver` JSON on the Program record, or confirm `MAIL_HOST`/`MAIL_PORT` env vars cover it
- [ ] Check any rich-text fields for `.cgi` links
- [ ] Confirm WWWREF/shell HTML files are accessible at `WWWREF_ROOT` / `TEMPLATE_ROOT`
- [ ] Test login, entry submission, invoice, and payment flows end-to-end
