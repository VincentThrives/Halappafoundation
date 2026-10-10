# Halappa Foundation website

Bilingual (English / ಕನ್ನಡ) website for the Halappa Foundation and Muralidhar Halappa.

- **frontend/**: Angular 18 (standalone components). Public site and admin panel.
- **backend/**: Spring Boot 3.3, Java 21. REST API, JWT admin login, Excel import/export (Apache POI),
  bulk WhatsApp (Meta Cloud API) / Email (SMTP + IMAP) / SMS (MSG91), inbox, entrance vouchers.

## Run locally

```bash
# API on :8090 (H2 file DB in backend/data, no setup needed)
cd backend && ./mvnw spring-boot:run

# Web on :4210 (calls the API at the address in src/environments/environment.ts)
cd frontend && npm install && npm start
```

### Frontend environments

The backend address comes from `frontend/src/environments/`:

| File | Used by | `apiUrl` |
|---|---|---|
| `environment.ts` | `npm start`, `ng test`, `ng build --configuration development` | `http://localhost:8090` |
| `environment.prod.ts` | `npm run build` (production; swapped in via `fileReplacements` in `angular.json`) | the hosted backend |

Code keeps writing short paths (`/api/...`); `core/backend.ts` adds `apiUrl` to every API request, and the `media` pipe
does the same for uploaded photos (`<img [src]="p.image | media">`). The backend must list the site's address in
`CORS_ORIGINS` (local default: `http://localhost:4210`).

Open http://localhost:4210. Admin panel: http://localhost:4210/admin (or **Sign in** in the site's top bar).
The first admin account is created on first start from `SEED_ADMIN_USERNAME` (default `admin`) and `SEED_ADMIN_PASSWORD`.
If no password is set, a random one-time password is printed once in the server log. There is **no password in the code**.
Change the password under **Admin → Settings** after the first login.

## What the admin can do

| Screen | Purpose |
|---|---|
| Dashboard | Enquiry counts; quick links to queries, Excel, bulk message, Inbox, voucher check-in |
| Enquiries | Search/filter, status, notes, delete. **Download to Excel** by From–To date (inclusive, with presets) or **Download ALL**; Enquiries + Summary sheets. Tick rows → send them a bulk message |
| **Bulk messages** | WhatsApp, Email or SMS to **up to 5000 people per send**. Recipients from an **Excel/CSV import** (Name, Phone, Email, Voucher — any order, Kannada headings OK; sample file downloadable), enquiries (selected / date range / everyone) or pasted numbers. **Entrance voucher on by default**: auto-numbered (prefix + start + digits, e.g. KIT-2026-0001), taken from the Excel's Voucher column, or one code for everyone; never re-issued. `{name}` and `{voucher}` fill in per person. Live progress, pause / resume / cancel, retry failed, Excel of recipients with vouchers |
| **Inbox** | Every message **received and sent**: WhatsApp (incoming via webhook, with delivered/read ticks), Email (mailbox read over IMAP), SMS (incoming webhook) and Contact Us submissions. Conversations per person with replies (WhatsApp, Email), plus a searchable log filtered by channel, in/out, status and date. Unread badge in the menu |
| **Voucher check-in** | Event desk: type or scan the voucher, see the person, **Mark attended** (second scan warns "already checked in") |
| Press & Views, Gallery, Timeline, Settings | Site content (EN + KN), contact details and social links |

### Connecting the channels

| Channel | Sending | Receiving | Server settings |
|---|---|---|---|
| WhatsApp | Without keys: manual links ("Open next"). With Meta Cloud API: automatic, ~15/second | Meta webhook → `https://<site>/api/webhooks/whatsapp` | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` |
| Email | SMTP | IMAP check every 2 minutes | `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM`, `MAIL_IMAP_HOST` |
| SMS | MSG91 Flow API, 100 per request | Provider's inbound webhook → `/api/webhooks/sms?token=…` | `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_FLOW_ID`, `SMS_INBOUND_TOKEN` |

Important:
- **WhatsApp invitations need an approved template** in Meta (free text only reaches people who messaged in the last 24 h).
  In the template, `{{1}}` = name and `{{2}}` = voucher. To send 5000 in a day the number needs Meta's 10K messaging tier.
  A number on the Cloud API can't be used in the normal WhatsApp app at the same time.
- **SMS in India needs DLT**: register the sender ID and template (with variables for name and voucher), create a
  Flow in MSG91 using `##name##` and `##voucher##`, and put its id in `MSG91_FLOW_ID`.
- **Email** at 5000/day needs a mailbox plan that allows it (e.g. Gmail caps at ~500/day). Sends are paced (`CAMPAIGN_EMAIL_DELAY_MS`).
- Sends run in the background and survive a server restart (queued messages continue).

## Tests

```bash
# Backend: 174 tests (unit + API integration on in-memory H2, fake WhatsApp/MSG91 server, real in-process mail server)
# Coverage report: backend/target/site/jacoco/index.html (95% of lines)
cd backend && ./mvnw test

# Frontend: 188 tests in headless Chrome (set CHROME_BIN if Chrome isn't found); add --code-coverage for frontend/coverage (93% of lines)
cd frontend && npm run test:ci
```

A readable list of every test case: **TEST-REPORT.html**.

| Area | What is covered |
|---|---|
| Public site | Settings, posts, timeline, gallery, 404s; Contact form (email/WhatsApp, Kannada, validation, honeypot, rate limit) |
| Sign in | Right/wrong password, brute-force block, change password, forged/expired tokens, every admin API needs login |
| Queries & Excel | Search, filters, inclusive date ranges, paging, status/notes/delete; Excel by range / ALL / selected, Summary sheet, Kannada |
| Excel import | .xlsx/.xls/.csv, any column order, Kannada headings, title rows, numeric phones, BOM/quotes, bad rows and duplicates reported, exactly 5000 OK / 5001 refused, sample file round-trip |
| Bulk messages | **5000-message WhatsApp template send end-to-end** (name + voucher parameters), SMS in batches of 100 with name/voucher, personalised email subject/body, auto/excel/fixed vouchers, no voucher re-use, dedupe, limits, failures + retry, pause/cancel, manual mode, recipient Excel |
| Inbox & webhooks | Webhook verify + signature check, incoming WhatsApp (text, buttons, retries not duplicated), delivered/read/failed receipts (never go backwards), incoming SMS (JSON/form), unread counts, replies on WhatsApp/Email, SMS reply refused |
| Voucher check-in | Lookup (case/space-insensitive), mark attended, second check-in refused, attended count |
| Frontend | EN/KN completeness, language switch, header/footer/social bar, contact form, pages; Excel panel; bulk message wizard (import, voucher modes, sources, limits, templates, email subject); progress polling and controls; manual "Open next"; Inbox threads/replies/log/refresh; voucher check-in; login, dashboard, route guards |

## Production environment variables

| Variable | Notes |
|---|---|
| `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD` | PostgreSQL, e.g. `jdbc:postgresql://host:5432/halappa` |
| `JWT_SECRET` | 64+ random characters (required in production; without it sign-ins end on every restart) |
| `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` | First admin only (set a strong password before the first start) |
| `UPLOADS_DIR` | Persistent disk path for uploaded photos |
| `WEB_STATIC_DIR` | Path to `frontend/dist/frontend/browser` to serve the site from the same server |
| `CORS_ORIGINS` | The website's address(es), comma-separated, e.g. `https://halappafoundation.in` (the site calls the API at `apiUrl` from `environment.prod.ts`) |
| `MAIL_*`, `MAIL_IMAP_*` | Sending and reading email (see table above) |
| `WHATSAPP_*` | WhatsApp Cloud API + webhook |
| `SMS_PROVIDER`, `MSG91_*`, `SMS_INBOUND_TOKEN` | SMS |
| `CAMPAIGN_MAX_RECIPIENTS` | Default 5000 per send |

Single-server deploy: `cd frontend && npm run build`, then run the jar with
`WEB_STATIC_DIR=../frontend/dist/frontend/browser java -jar backend/target/halappa-foundation.jar`.
