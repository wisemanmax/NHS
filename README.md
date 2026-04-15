# 🎓 High School Reunion Website

A lean, production-ready reunion site built for under 500 attendees with near-zero ongoing cost.

**Stack:** Static HTML → GitHub Pages · Supabase (DB + Auth) · Vercel (Email API) · Resend (Email sending)

---

## 📁 Project Structure

```
reunion/
├── index.html          → Home page (hero, countdown, event summary)
├── details.html        → Event details (date, venue, organizer)
├── faq.html            → FAQ accordion
├── rsvp.html           → RSVP form (writes to Supabase)
├── success.html        → Post-RSVP confirmation
├── admin.html          → Protected admin dashboard
│
├── css/
│   └── style.css       → All styles (responsive, mobile-first)
│
├── js/
│   └── config.js       → ✏️ Edit this to update event details
│
├── api/
│   └── send-email.js   → Vercel serverless function (mass email)
│
├── schema.sql          → Supabase table setup
├── vercel.json         → Vercel deployment config
├── .env.example        → Environment variable template
└── README.md
```

---

## ⚡ Quick Start (Step-by-Step)

### Step 1 — Customize your event

Open `js/config.js` and update:
- School name, graduation year, tagline
- Event date, time, venue, address
- Organizer name and email
- Facebook group link

That's it for content — everything reads from this file.

---

### Step 2 — Set up Supabase

1. Go to [supabase.com](https://supabase.com) → New Project (free tier)
2. Once created, go to **SQL Editor** and paste the entire contents of `schema.sql` → Run
3. Go to **Settings → API** and copy:
   - Project URL → `SUPABASE_URL`
   - `anon` public key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_KEY` (server-side only!)
4. Go to **Authentication → Users** → Invite the organizer's email as an admin user

---

### Step 3 — Configure Supabase keys in your frontend

In `js/config.js`, update:
```js
supabaseUrl: "https://yourproject.supabase.co",
supabaseAnonKey: "eyJ...",
```

> ✅ The `anon` key is safe to put in frontend code. Supabase RLS policies protect your data.  
> ❌ Never put the `service_role` key in frontend code.

---

### Step 4 — Deploy frontend to GitHub Pages

```bash
# Create a new GitHub repo (e.g. "reunion")
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/reunion.git
git push -u origin main
```

Then in GitHub:
1. Go to your repo → **Settings → Pages**
2. Source: `Deploy from a branch`
3. Branch: `main` / `/ (root)` → Save

Your site will be live at: `https://YOUR_USERNAME.github.io/reunion/`

---

### Step 5 — Set up Resend for email sending

1. Sign up at [resend.com](https://resend.com) (free: 3,000 emails/month)
2. Add and verify your sending domain (or use `onboarding@resend.dev` for testing)
3. Create an API key → copy it

---

### Step 6 — Deploy email API to Vercel

```bash
npm install -g vercel
vercel login
vercel  # follow prompts — select this folder as the project
```

In Vercel Dashboard → your project → **Settings → Environment Variables**, add:
```
SUPABASE_URL          = your Supabase URL
SUPABASE_SERVICE_KEY  = your service role key
RESEND_API_KEY        = re_xxxx...
FROM_NAME             = Your Reunion Committee Name
FROM_EMAIL            = hello@yourdomain.com
SITE_URL              = https://yourusername.github.io/reunion
```

Redeploy after adding env vars:
```bash
vercel --prod
```

---

### Step 7 — Update admin email API endpoint

In `admin.html`, the `sendEmail()` function calls `/api/send-email`. Update this to your Vercel URL:

```js
const res = await fetch('https://YOUR-PROJECT.vercel.app/api/send-email', {
```

---

## 🔐 Security Notes

| Feature | Implementation |
|---|---|
| Form spam protection | Honeypot field + server-side email deduplication |
| Duplicate email protection | Unique constraint on `email` column + client-side pre-check |
| Admin access | Supabase Auth (email + password or magic link) |
| Email API | Auth token validated server-side before any emails sent |
| RLS | Anon users can INSERT but not SELECT other rows |
| PII | Never exposed in public stats (aggregate only) |

---

## 💰 Cost Breakdown

| Service | Free Tier | Your Usage | Cost |
|---|---|---|---|
| GitHub Pages | Unlimited public repos | Static hosting | **$0** |
| Supabase | 500MB DB, 50K monthly active users | ~500 rows, minimal auth | **$0** |
| Resend | 3,000 emails/month, 100/day | <500 recipients, occasional blasts | **$0** |
| Vercel | 100GB bandwidth, unlimited functions | API calls only | **$0** |
| **Total** | | | **$0/month** |

---

## 📧 Sending Mass Emails

1. Log into `admin.html` with your organizer credentials
2. Click **Send Email Update**
3. Fill in subject and message body
4. Use `{name}` in the message — it auto-personalizes with each recipient's first name
5. Click Send — you'll see a success count

All sends are logged to the `communication_logs` table in Supabase.

---

## 📱 Sharing the Link

Drop this into Facebook groups, group chats, etc.:

```
🎓 [School Name] Class of [Year] Reunion!
[Date, Venue]
RSVP here (takes 60 seconds): https://yourusername.github.io/reunion
```

Use `?src=facebook` on the URL to track signup sources:
`https://yourusername.github.io/reunion?src=facebook`

---

## 🔜 Phase 2: SMS Support (Twilio)

The database already stores `sms_opt_in`. When ready to add SMS:

1. Sign up at [twilio.com](https://twilio.com)
2. Get a phone number (~$1/month)
3. Add to `.env`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
4. Create `api/send-sms.js` following the same pattern as `send-email.js`
5. Query `WHERE sms_opt_in = true` from attendees and send via Twilio's REST API

---

## 🛠 Updating Event Details

All event content lives in `js/config.js`. Edit and push to GitHub — GitHub Pages redeploys automatically within minutes.

```bash
git add js/config.js
git commit -m "Update venue address"
git push
```

---

## ❓ Support

Questions about setup? Review the comments in:
- `js/config.js` — event configuration
- `schema.sql` — database setup notes
- `api/send-email.js` — email sending logic
