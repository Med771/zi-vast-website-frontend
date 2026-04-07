'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

(function loadLocalEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  } catch { /* ignore */ }
})();

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3847;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  if (pathname === '/' || pathname === '') pathname = '/index.html';

  /**
   * Прод (zi-tech.ru): страница — /digital/zitag | /digital/zichecker, статика — /digital/style.css и т.д.
   * Браузер с URL …/digital/zichecker (без / в конце) резолвит относительный style.css в …/digital/style.css.
   * Локально маппим /digital/<файл> на файлы из корня репозитория.
   */
  if (pathname === '/digital' || pathname === '/digital/') {
    pathname = '/index.html';
  } else if (pathname.startsWith('/digital/')) {
    const sub = pathname.slice('/digital/'.length);
    const spaEntry = sub === 'zitag' || sub === 'zitag/' || sub === 'zichecker' || sub === 'zichecker/';
    if (spaEntry) pathname = '/index.html';
    else pathname = '/' + sub;
  }

  const filePath = path.join(ROOT, path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, ''));
  const resolvedRoot = path.resolve(ROOT);
  const resolvedFile = path.resolve(filePath);
  const rel = path.relative(resolvedRoot, resolvedFile);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Server Error');
      }
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`ZiTag: http://localhost:${PORT}/`);
});
