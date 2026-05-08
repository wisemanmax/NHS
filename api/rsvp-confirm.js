// api/rsvp-confirm.js
// Sends a single confirmation email after a successful RSVP.
// Called from rsvp.html after the Supabase insert succeeds.
//
// Endpoint: POST /api/rsvp-confirm
// Body: { email: string, first_name: string, attending_status: 'yes'|'no'|'maybe' }
// No auth required — but we re-check the RSVP exists in Supabase before sending,
// so spammers can't blast confirmation emails to arbitrary addresses.

const { createClient } = require('@supabase/supabase-js');
const { buildEmailHtml } = require('../lib/email-template.js');

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

const STATUS_COPY = {
  yes:   { headline: "You're confirmed!", line: "We've got you down as attending. Can't wait to see you." },
  maybe: { headline: "Thanks for the heads-up.", line: "You're on the 'Maybe' list. We'll keep you posted as details firm up — feel free to update your RSVP anytime." },
  no:    { headline: "Thanks for letting us know.", line: "Sorry you can't make it this time — we'll send a recap after the reunion so you're not totally out of the loop." },
};

async function sendViaResend({ to, subject, html, fromName, fromEmail }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Resend ${res.status}`);
  }
  return res.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const allowedOrigin = process.env.SITE_URL || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { email, first_name, attending_status } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  if (!STATUS_COPY[attending_status]) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  // Verify the RSVP actually exists (and was opted-in) before sending.
  const sb = getSupabase();
  const { data: row, error: dbError } = await sb
    .from('attendees')
    .select('email, first_name, email_opt_in, attending_status')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (dbError) {
    console.error('DB error:', dbError);
    return res.status(500).json({ error: 'Lookup failed' });
  }
  if (!row) {
    // Don't reveal whether the email exists — just no-op.
    return res.status(200).json({ sent: false, reason: 'not_found' });
  }
  if (!row.email_opt_in) {
    return res.status(200).json({ sent: false, reason: 'opted_out' });
  }

  const FROM_NAME = process.env.FROM_NAME || 'Reunion Committee';
  const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@example.com';
  const SITE_URL = process.env.SITE_URL || '';
  const copy = STATUS_COPY[row.attending_status] || STATUS_COPY.yes;
  const name = row.first_name || first_name || 'Friend';

  const subject = copy.headline;
  const body = `Hi ${name},\n\n${copy.line}\n\nWe'll send updates as the date gets closer — venue confirmation, schedule, and any final details. In the meantime, share the site with anyone we might've missed.\n\nSee you soon,\nThe ${FROM_NAME}`;

  const html = buildEmailHtml({
    body,
    subject,
    fromName: FROM_NAME,
    siteUrl: SITE_URL,
    ctaText: 'View Event Details',
    ctaUrl: SITE_URL ? SITE_URL + '/details.html' : '#',
    preheader: copy.line,
  });

  try {
    await sendViaResend({
      to: row.email,
      subject,
      html,
      fromName: FROM_NAME,
      fromEmail: FROM_EMAIL,
    });
    // Log it
    await sb.from('communication_logs').insert({
      type: 'email',
      subject,
      body: '[automated rsvp confirmation]',
      recipient_count: 1,
      sent_by: 'system',
      notes: `RSVP confirmation for ${row.email}`,
    });
    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('Resend error:', err.message);
    return res.status(500).json({ error: 'Email failed', details: err.message });
  }
};
