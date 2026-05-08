// api/env.js
// Exposes only the public Supabase keys to the browser.
// Loaded as a <script src="/api/env.js"> BEFORE js/config.js.
// The anon key is safe to expose; RLS protects the data.

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }
  const url = process.env.SUPABASE_URL || '';
  const anon = process.env.SUPABASE_ANON_KEY || '';

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.send(
    `window.ENV_SUPABASE_URL=${JSON.stringify(url)};` +
    `window.ENV_SUPABASE_ANON_KEY=${JSON.stringify(anon)};`
  );
};
