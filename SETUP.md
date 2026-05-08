# NHS Class of 2016 Reunion — Ship Checklist

Everything you need to take this site from repo to live.

The site is **vanilla HTML + CSS + JS**. The backend is **Supabase** (database, auth, storage). Email is **Resend**. Hosting is **Vercel** (static files + `/api` serverless functions).

---

## 0 · Customize content first

Open [`js/config.js`](js/config.js) and fill in:

| Field | Notes |
|---|---|
| `venueName`, `venueAddress`, `venueMapLink` | Currently `TBA` / blank — set as soon as the venue is confirmed |
| `organizerName`, `organizerEmail` | Email must match your Resend verified sending domain |
| `facebookGroup` | URL of the FB group (or leave blank to hide the link) |
| `instagramHandle` | Reunion IG handle, no `@` |
| `metaImage` | Drop a 1200×630 JPG at `/images/og-cover.jpg` |
| `siteUrl` | `https://newark2016.com` (or your domain) |
| `heroImage` / `heroImageWebp` | Drop a class photo at `/images/hero.jpg` and `/images/hero.webp` (target <250KB, 1920×1080) |

The admin dashboard at `/admin.html` (Event Settings tab) lets the committee chair edit most of these in-browser without touching code — but only after the GitHub token is set up (see §4).

> Then update FAQ #6 (food/drinks) and #9 (photographer) once you've nailed those down.

---

## 1 · Domain (5 min)

1. Buy `newark2016.com` (Cloudflare Registrar — cheapest, no add-on upsells).
2. Hold off on DNS — you'll point it at Vercel in §5.

---

## 2 · Supabase (15 min)

1. Sign up at [supabase.com](https://supabase.com) → **New Project**, name `nhs-2016-reunion`, region `us-east-1`. Save the password.
2. **Project Settings → API** — copy:
   - `Project URL` → `SUPABASE_URL`
   - `anon` `public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_KEY` (server-side only, treat as a password)
3. **SQL Editor → New query** → paste the entire contents of [`schema.sql`](schema.sql) → **Run**. This creates `attendees`, `communication_logs`, `gallery_uploads`, public stat functions, and RLS.
4. **Storage → New bucket** → name `gallery-photos`, **Public bucket: ON** → Save.
5. **Authentication → Users → Invite user** → enter the organizer's email. They'll get a magic-link email; have them set a password from there.
6. Run an **Advisor check** (`Database → Advisors`) and resolve anything flagged red.

---

## 3 · Resend (10 min)

1. Sign up at [resend.com](https://resend.com).
2. **Domains → Add Domain** → `newark2016.com`. Resend gives you SPF, DKIM, DMARC records — add them at your DNS host (Cloudflare/Namecheap).
3. Wait for "Verified" (usually <5 min). Until verified, emails will fail.
4. **API Keys → Create API Key** → scope `Send` → save as `RESEND_API_KEY`.
5. Test from the Resend dashboard "Send Test" before going live.

---

## 4 · GitHub (5 min)

1. Push this repo to GitHub (already on branch `claude/school-reunion-website-SS3WI`).
2. Generate a **fine-grained personal access token**: github.com/settings/personal-access-tokens/new
   - Repository access: only the reunion repo
   - Permissions: **Contents → Read and write**
   - Save the token as `GITHUB_TOKEN`. Set `GITHUB_REPO=wisemanmax/nhs`.
3. This is what powers the in-browser **Event Settings** editor in `/admin.html`.

---

## 5 · Vercel (10 min)

1. [vercel.com/new](https://vercel.com/new) → Import the GitHub repo.
2. Framework Preset: **Other**. Build Command: empty. Output: **leave default** (Vercel auto-detects).
3. **Environment Variables** — paste each from [`.env.example`](.env.example) (Production + Preview):
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
   - `RESEND_API_KEY`, `FROM_NAME`, `FROM_EMAIL`
   - `SITE_URL`, `GITHUB_TOKEN`, `GITHUB_REPO`
4. Deploy. The first build will succeed even if envs are wrong; static pages render and the API endpoints will surface real errors when they need real values.
5. **Project → Domains → Add** → `newark2016.com` and `www.newark2016.com`. Vercel shows you the DNS records to add at your registrar.
6. Once DNS propagates, Vercel issues a free SSL cert automatically.

> The site loads `/api/env.js` (a 1-line script) before `js/config.js` to inject the public Supabase URL + anon key into the browser, pulled from Vercel env. No keys are committed to the repo.

---

## 6 · Post-deploy smoke test

- [ ] `https://newark2016.com` loads and shows the countdown
- [ ] Submit a real RSVP → row appears in `attendees` (Supabase Table Editor)
- [ ] Confirmation email arrives at the inbox you used (check spam folder once; if it's clean once, it'll be clean forever for that domain)
- [ ] `/admin.html` → log in → see your test RSVP in the table
- [ ] Send a test mass email to your own email only (clear other RSVPs first) → arrives, `communication_logs` row created
- [ ] `/gallery.html` → upload a photo using your RSVP'd email → admin moderation queue → approve → photo appears in the gallery
- [ ] Change a value in **Event Settings** tab → click Save → commit appears on GitHub → Vercel redeploys → site reflects the change within ~60s
- [ ] `https://newark2016.com/sitemap.xml` returns the sitemap; `/robots.txt` returns the right rules
- [ ] Visit a fake URL like `/foo` → 404 page renders
- [ ] Lighthouse on Home / RSVP / Gallery (mobile): Perf ≥ 90, A11y ≥ 95, SEO 100, Best Practices ≥ 95
- [ ] Run [Rich Results Test](https://search.google.com/test/rich-results) on `https://newark2016.com/` → Event schema validates
- [ ] Run [mail-tester.com](https://www.mail-tester.com/) on the confirmation email → score ≥ 9/10
- [ ] Tab-only keyboard walkthrough completes the RSVP form

---

## 7 · Spread the word (the day you ship)

1. Post in the Class of 2016 Facebook group, tag everyone you can.
2. DM 5 people directly with the link — ask them to RSVP and forward.
3. LinkedIn post with the OG cover image.
4. Email blast (admin → Send Email Update) once you have ~20 RSVPs to seed momentum.

---

## 8 · Day-of (Aug 15, 2026)

- Set `eventDate` to `null` in `js/config.js` after the reunion ends — the countdown will hide gracefully.
- Pull the final attendee list as CSV from the admin dashboard 48 hours before, share with the venue.
- Within 60 days post-event, delete the database (per privacy promise on `/privacy.html`).

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Gallery upload fails with `Bucket not found` | Bucket `gallery-photos` not created in Supabase Storage, or not public |
| Confirmation email not arriving | Resend domain not verified, or `FROM_EMAIL` doesn't match the verified domain |
| Admin "Save & Publish" returns 500 | `GITHUB_TOKEN` or `GITHUB_REPO` not set in Vercel env |
| Stats show `—` forever | `SUPABASE_URL`/`SUPABASE_ANON_KEY` not loaded — check `/api/env.js` returns the keys |
| `Who's Going` empty | Function `get_whos_going()` not granted to `anon` — re-run `schema.sql` |

---

Built lean. Hosted free (Vercel hobby + Supabase free + Resend 100/day + Cloudflare domain). Total monthly cost: **$0** unless you exceed Resend's free tier (then $20/mo for 50k sends).
