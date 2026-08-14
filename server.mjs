import http from 'http';
import fs from 'fs';
import path from 'path';
const dir = 'C:\\Users\\iangi\\AppData\\Local\\Temp\\opencode\\scalboost\\dubapp';
http.createServer((req, res) => {
  const file = path.join(dir, req.url === '/' ? 'index.html' : req.url);
  if (!file.startsWith(dir) || !fs.existsSync(file)) { res.writeHead(404); return res.end('404'); }
  const ext = path.extname(file);
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(3000, () => console.log('dubapp en http://localhost:3000'));