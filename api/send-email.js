// api/send-email.js
// Vercel Serverless Function — Secure mass email sender using Resend
// Deploy to Vercel. Set env vars: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
//
// Endpoint: POST /api/send-email
// Body: { subject: string, body: string }
// Auth: Requires valid Supabase session token in Authorization header

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase with service role key (bypasses RLS for server-side reads)
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY  // Never expose this in frontend code
  );
}

// Send a single email via Resend
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
    const err = await res.json();
    throw new Error(err.message || 'Resend API error');
  }
  return res.json();
}

// Wrap plain text body in simple branded HTML email
function buildEmailHtml(body, subject, fromName) {
  // Convert newlines to <br> tags
  const htmlBody = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#FDFAF4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #E2D9C8;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background:#1A2E4A;padding:28px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.6);">Reunion Update</p>
              <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#E8B860;">${fromName}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px;">
              <p style="font-size:22px;font-weight:700;color:#1A2E4A;margin:0 0 16px;">${subject}</p>
              <div style="font-size:15px;color:#444;line-height:1.7;">
                <p>${htmlBody}</p>
              </div>
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td style="padding:0 32px 28px;">
              <a href="${process.env.SITE_URL || '#'}"
                style="display:inline-block;background:#C9963E;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
                View Event Details →
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #E2D9C8;background:#FDFAF4;">
              <p style="margin:0;font-size:12px;color:#888;line-height:1.6;">
                You're receiving this because you RSVP'd and opted in to email updates.<br/>
                To unsubscribe, reply to this email with "unsubscribe" in the subject.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ---- Main Handler ----
module.exports = async function handler(req, res) {
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS — restrict to your domain in production
  const allowedOrigin = process.env.SITE_URL || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // ---- Auth check: require valid Supabase session ----
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized — missing token' });
  }
  const token = authHeader.replace('Bearer ', '');

  // Verify token against Supabase
  const sbAdmin = getSupabase();
  const { data: { user }, error: authError } = await sbAdmin.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized — invalid session' });
  }

  // ---- Validate input ----
  const { subject, body } = req.body || {};
  if (!subject || !body || subject.trim().length < 3 || body.trim().length < 10) {
    return res.status(400).json({ error: 'Subject and body are required' });
  }

  // ---- Fetch opted-in subscribers ----
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

  // ---- Send emails (batched with small delay to respect rate limits) ----
  let sent = 0;
  const errors = [];

  for (const sub of subscribers) {
    try {
      const personalizedSubject = subject;
      const personalizedBody = body.replace(/{name}/gi, sub.first_name || 'Friend');
      const html = buildEmailHtml(personalizedBody, personalizedSubject, FROM_NAME);

      await sendViaResend({
        to: sub.email,
        subject: personalizedSubject,
        html,
        fromName: FROM_NAME,
        fromEmail: FROM_EMAIL,
      });
      sent++;

      // Small delay between sends to avoid rate limiting (Resend free: 100/day)
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
