// Shared branded email template — used by /api/send-email and /api/rsvp-confirm.

function escape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function bodyToHtml(body) {
  return escape(body)
    .replace(/\n\n/g, '</p><p style="margin:0 0 1em;">')
    .replace(/\n/g, '<br/>');
}

function buildEmailHtml({ body, subject, fromName, siteUrl, ctaText, ctaUrl, preheader }) {
  const safeSubject = escape(subject || '');
  const safeFromName = escape(fromName || 'Reunion Committee');
  const safeBody = bodyToHtml(body || '');
  const safeCta = escape(ctaText || 'View Event Details');
  const safeCtaUrl = ctaUrl || siteUrl || '#';
  const pre = escape(preheader || subject || '');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeSubject}</title>
</head>
<body style="margin:0;padding:0;background:#FDFAF4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1C1917;">
  <span style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;color:#FDFAF4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${pre}</span>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:32px 16px;background:#FDFAF4;">
    <tr>
      <td align="center">
        <table width="100%" role="presentation" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E2D9C8;box-shadow:0 4px 20px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background:#1A1A1A;padding:30px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(245,197,24,0.85);">Reunion Update</p>
              <p style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#F5C518;letter-spacing:0.01em;">${safeFromName}</p>
            </td>
          </tr>

          <!-- Gold accent rule -->
          <tr><td style="height:3px;background:linear-gradient(90deg,#D4A017 0%,#F5C518 100%);"></td></tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 20px;">
              <p style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:#1A1A1A;margin:0 0 18px;line-height:1.25;">${safeSubject}</p>
              <div style="font-size:15px;color:#3A3A3A;line-height:1.7;">
                <p style="margin:0 0 1em;">${safeBody}</p>
              </div>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 32px 32px;">
              <a href="${safeCtaUrl}"
                style="display:inline-block;background:#D4A017;color:#ffffff;padding:13px 26px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.02em;">
                ${safeCta} →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:22px 32px;border-top:1px solid #E2D9C8;background:#FDFAF4;">
              <p style="margin:0 0 6px;font-size:12px;color:#6B6560;line-height:1.6;">
                You're receiving this because you RSVP'd and opted in to email updates.
              </p>
              <p style="margin:0;font-size:12px;color:#6B6560;line-height:1.6;">
                <a href="mailto:${process.env.FROM_EMAIL || ''}?subject=unsubscribe" style="color:#6B6560;text-decoration:underline;">Unsubscribe</a>
                &nbsp;·&nbsp;
                <a href="${siteUrl || '#'}/privacy.html" style="color:#6B6560;text-decoration:underline;">Privacy</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { buildEmailHtml };
