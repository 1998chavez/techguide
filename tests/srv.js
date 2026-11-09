// [v1.73.0] Servidor estático mínimo para las pruebas en navegador: sirve el
// repo en /techguide/, igual que GitHub Pages. Puerto libre que elige el sistema.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary',
};

function servir(raiz) {
  return new Promise((listo) => {
    const s = http.createServer((q, r) => {
      const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
      if (!u.startsWith('/techguide/')) { r.writeHead(404); return r.end(); }
      let f = path.join(raiz, u.slice(11) || 'index.html');
      if (f.endsWith(path.sep)) f = path.join(f, 'index.html');
      if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => listo(s));
  });
}

module.exports = { servir };
