// Servidor estático — compatible con Vercel (serverless) y local (node server.mjs)
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
  const urlPath = (req.url || '/').split('?')[0];
  let filePath = path.join(dir, urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath));
  if (!filePath.startsWith(dir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(dir, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
};

// Local: `node server.mjs`
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  http.createServer(handler).listen(3000, () => console.log('dubapp en http://localhost:3000'));
}

// Vercel: export default handler
export default handler;