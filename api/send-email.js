// api/send-email.js
// Vercel Serverless Function — Secure mass email sender using Resend
// Deploy to Vercel. Set env vars: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
//
// Endpoint: POST /api/send-email
// Body: { subject: string, body: string }
// Auth: Requires valid Supabase session token in Authorization header

const { createClient } = require('@supabase/supabase-js');
const { buildEmailHtml } = require('../lib/email-template.js');

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized — missing token' });
  }
  const token = authHeader.replace('Bearer ', '');

  const sbAdmin = getSupabase();
  const { data: { user }, error: authError } = await sbAdmin.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized — invalid session' });
  }

  const { subject, body } = req.body || {};
  if (!subject || !body || subject.trim().length < 3 || body.trim().length < 10) {
    return res.status(400).json({ error: 'Subject and body are required' });
  }

  const { data: subscribers, error: dbError } = await sbAdmin
    .from('attendees')
    .select('email, first_name, last_name')
    .eq('email_opt_in', true);

  if (dbError) {
    console.error('DB error:', dbError);
    return res.status(500).json({ error: 'Failed to fetch subscribers' });
  }

  if (!subscribers || subscribers.length === 0) {
    return res.status(200).json({ count: 0, message: 'No opted-in subscribers found.' });
  }

  const FROM_NAME = process.env.FROM_NAME || 'Reunion Committee';
  const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@yourdomain.com';
  const SITE_URL = process.env.SITE_URL || '';

  let sent = 0;
  const errors = [];

  for (const sub of subscribers) {
    try {
      const personalizedSubject = subject;
      const personalizedBody = body.replace(/{name}/gi, sub.first_name || 'Friend');
      const html = buildEmailHtml({
        body: personalizedBody,
        subject: personalizedSubject,
        fromName: FROM_NAME,
        siteUrl: SITE_URL,
        ctaText: 'View Event Details',
        ctaUrl: SITE_URL,
      });

      await sendViaResend({
        to: sub.email,
        subject: personalizedSubject,
        html,
        fromName: FROM_NAME,
        fromEmail: FROM_EMAIL,
      });
      sent++;

      if (subscribers.length > 10) {
        await new Promise(r => setTimeout(r, 100));
      }
    } catch (err) {
      console.error(`Failed to send to ${sub.email}:`, err.message);
      errors.push({ email: sub.email, error: err.message });
    }
  }

  return res.status(200).json({
    count: sent,
    total: subscribers.length,
    errors: errors.length > 0 ? errors : undefined,
    message: `Successfully sent to ${sent} of ${subscribers.length} subscribers.`,
  });
};
