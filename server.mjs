// Servidor estático local; el frontend usa el gateway remoto de doblaje.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const handler = async (req, res) => {
  const rawPath = (req.url || '/').split('?')[0];
  let decoded;
  try { decoded = decodeURIComponent(rawPath); } catch { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Bad request'); return; }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^[/\\]+/, '');
  const filePath = path.resolve(dir, relative);
  const root = `${path.resolve(dir)}${path.sep}`;
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
  fs.createReadStream(filePath).on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); }).pipe(res);
};

// Local: `node server.mjs`
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  http.createServer(handler).listen(3000, () => console.log('dubapp en http://localhost:3000'));
}

// Vercel: export default handler
export default handler;
