import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers,
  });
  res.end(body);
}

function resolveRequestPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT, relative);
  if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) {
    return null;
  }
  return resolved;
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    send(res, 400, 'Bad Request', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/healthz') {
    send(
      res,
      200,
      JSON.stringify({ ok: true, service: 'coc-lab', uptime: process.uptime() }),
      { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    );
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed', {
      'Content-Type': 'text/plain; charset=utf-8',
      Allow: 'GET, HEAD',
    });
    return;
  }

  const filePath = resolveRequestPath(url.pathname);
  if (!filePath) {
    send(res, 400, 'Bad Request', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw Object.assign(new Error('Not a file'), { code: 'ENOENT' });

    const body = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const isHtml = extension === '.html';

    send(res, 200, req.method === 'HEAD' ? undefined : body, {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': isHtml
        ? 'no-cache'
        : 'public, max-age=0, must-revalidate',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
    });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      send(
        res,
        404,
        `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>404 — CoC Lab</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#070b0d;color:#f2f0e8;font:14px system-ui"><div style="text-align:center"><div style="font:11px monospace;letter-spacing:.2em;color:#5c6a6e">COC / 404</div><h1 style="font-weight:500;letter-spacing:-.04em">这一帧没有内容。</h1><a href="/" style="color:#b7f36b;font-size:12px">返回实验台 →</a></div></body></html>`,
        { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      );
      return;
    }
    console.error(error);
    send(res, 500, 'Internal Server Error', {
      'Content-Type': 'text/plain; charset=utf-8',
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`CoC Lab listening on http://${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
