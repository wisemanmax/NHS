// api/update-config.js
// Vercel Serverless Function — Updates js/config.js via GitHub API
// Deploy to Vercel. Set env vars: GITHUB_TOKEN, GITHUB_REPO, SUPABASE_URL, SUPABASE_SERVICE_KEY
//
// Endpoint: POST /api/update-config
// Body: { config: {...}, faq: [...] }
// Auth: Requires valid Supabase session token in Authorization header

const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

// Build the config.js file content from structured data
function buildConfigFile(config, faq) {
  // Escape backticks and ${} in text values for template literal safety
  function escapeForJS(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  }

  // Format a value for JS output
  function jsValue(val) {
    if (val === null || val === undefined) return 'null';
    if (val === '') return '""';
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    // Use backtick for multiline, double quotes for single line
    if (typeof val === 'string' && val.includes('\n')) {
      return '`' + escapeForJS(val) + '`';
    }
    return JSON.stringify(val);
  }

  const lines = [
    '// ============================================================',
    '// REUNION CONFIG — Edit this file to update your event details',
    '// ============================================================',
    '',
    'const REUNION_CONFIG = {',
    '  // Event Info',
    `  schoolName: ${jsValue(config.schoolName)},`,
    `  reunionTitle: ${jsValue(config.reunionTitle)},`,
    `  year: ${jsValue(config.year)},          // Graduation year(s) being celebrated`,
    `  mascot: ${jsValue(config.mascot)},`,
    `  tagline: ${jsValue(config.tagline)},`,
    `  description: ${jsValue(config.description)},`,
    '',
    '  // Date & Venue (set to null if TBD)',
    `  eventDate: ${config.eventDate ? jsValue(config.eventDate) : 'null'},   // ISO format — set to null if TBD`,
    `  eventDateDisplay: ${jsValue(config.eventDateDisplay)},`,
    `  eventTime: ${jsValue(config.eventTime)},`,
    `  venueName: ${jsValue(config.venueName)},`,
    `  venueAddress: ${jsValue(config.venueAddress)},`,
    `  venueMapLink: ${jsValue(config.venueMapLink)},`,
    '',
    '  // Dress code, tickets, etc.',
    `  dresscode: ${jsValue(config.dresscode)},`,
    `  ticketInfo: ${jsValue(config.ticketInfo)},`,
    `  ageRestriction: ${jsValue(config.ageRestriction)},`,
    '',
    '  // Organizer Contact',
    `  organizerName: ${jsValue(config.organizerName)},`,
    `  organizerEmail: ${jsValue(config.organizerEmail)},`,
    `  facebookGroup: ${jsValue(config.facebookGroup)},`,
    '',
    '  // Social / sharing',
    `  metaTitle: ${jsValue(config.metaTitle)},`,
    `  metaDescription: ${jsValue(config.metaDescription)},`,
    `  metaImage: ${jsValue(config.metaImage)}, // Optional: full URL to a share image`,
    '',
    '  // Supabase (set in env, but fallback here for local dev)',
    '  supabaseUrl: window.ENV_SUPABASE_URL || "YOUR_SUPABASE_URL",',
    '  supabaseAnonKey: window.ENV_SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY",',
    '};',
    '',
    '// FAQ entries — edit freely',
    'const FAQ_ITEMS = [',
  ];

  faq.forEach((item, i) => {
    lines.push('  {');
    lines.push(`    q: ${jsValue(item.q)},`);
    // The last FAQ item in the original references REUNION_CONFIG — we keep it simple with plain strings
    lines.push(`    a: ${jsValue(item.a)}`);
    lines.push('  },');
  });

  lines.push('];');
  lines.push('');

  return lines.join('\n');
}

module.exports = async function handler(req, res) {
  // CORS
  const allowedOrigin = process.env.SITE_URL || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ---- Auth check ----
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

  // ---- Validate input ----
  const { config, faq } = req.body || {};
  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid config object' });
  }
  if (!Array.isArray(faq)) {
    return res.status(400).json({ error: 'Missing or invalid faq array' });
  }

  // Validate required config fields
  const requiredFields = ['schoolName', 'reunionTitle', 'year'];
  for (const field of requiredFields) {
    if (!config[field] || !String(config[field]).trim()) {
      return res.status(400).json({ error: `Missing required field: ${field}` });
    }
  }

  // ---- Build config.js content ----
  const fileContent = buildConfigFile(config, faq);

  // ---- Push to GitHub ----
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_REPO; // e.g. "wisemanmax/nhs"

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return res.status(500).json({ error: 'GitHub credentials not configured on server' });
  }

  const filePath = 'js/config.js';
  const apiBase = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;

  try {
    // 1. Get current file SHA (needed for update)
    const getRes = await fetch(apiBase, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'reunion-admin',
      },
    });

    let sha = null;
    if (getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
    } else if (getRes.status !== 404) {
      const err = await getRes.text();
      throw new Error(`GitHub GET failed: ${getRes.status} ${err}`);
    }

    // 2. Update (or create) the file
    const updateBody = {
      message: `Update event config — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      content: Buffer.from(fileContent, 'utf-8').toString('base64'),
      committer: {
        name: 'Reunion Admin',
        email: user.email || 'admin@reunion.site',
      },
    };
    if (sha) {
      updateBody.sha = sha;
    }

    const putRes = await fetch(apiBase, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'reunion-admin',
      },
      body: JSON.stringify(updateBody),
    });

    if (!putRes.ok) {
      const err = await putRes.text();
      throw new Error(`GitHub PUT failed: ${putRes.status} ${err}`);
    }

    const result = await putRes.json();

    return res.status(200).json({
      success: true,
      message: 'Config updated and pushed to GitHub. Site will update in ~1 minute.',
      commitUrl: result.commit?.html_url || null,
      sha: result.content?.sha || null,
    });

  } catch (err) {
    console.error('GitHub update error:', err);
    return res.status(500).json({
      error: `Failed to push to GitHub: ${err.message}`,
    });
  }
};
