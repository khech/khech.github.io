import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entryFiles = new Set(['index.html', 'art.html', 'contacts.html', 'archive.html', '404.html', 'favicon.ico', 'studio/index.html', 'gallery/index.html']);
const publicRoots = new Set(['images', 'styles', 'scripts', 'projects']);
const mime = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.pdf': 'application/pdf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
export function createPreviewServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      if (pathname.includes('\\') || pathname.includes('\0')) { res.writeHead(400).end(); return; }
      if (pathname === '/studio' || pathname === '/gallery') {
        res.writeHead(301, { Location: pathname + '/' + url.search }).end(); return;
      }
      const relative = pathname.endsWith('/') ? pathname.slice(1) + 'index.html' : pathname.slice(1);
      if (relative.split('/').some(s => s.startsWith('.') || s === '..')) { res.writeHead(404).end('Not found'); return; }
      if (!entryFiles.has(relative) && !publicRoots.has(relative.split('/')[0])) { res.writeHead(404).end('Not found'); return; }
      const target = path.resolve(root, relative);
      if (!target.startsWith(root + path.sep) || !mime[path.extname(target).toLowerCase()]) { res.writeHead(404).end('Not found'); return; }
      const data = await fs.readFile(target);
      res.writeHead(200, { 'Content-Type': mime[path.extname(target).toLowerCase()], 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404).end('Not found'); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.argv[2] || '127.0.0.1';
  const port = Number(process.argv[3] || 4175);
  createPreviewServer().listen(port, host, () => console.log('Site preview: http://' + host + ':' + port + '/'));
}
