// Servidor estático local que imita a Vercel o suficiente para medir e testar:
// compressão (brotli/gzip, como a Vercel faz sozinha), `cleanUrls` (/provar serve provar.html,
// /provar.html redireciona para /provar), `redirects` e `headers` do vercel.json e a 404.html para
// caminhos que não existem; o que está no .vercelignore também dá 404, porque não chega à Vercel.
// Sem dependências.
//
// Uso: node scripts/serve.mjs [porta]   (por omissão 8000)

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

const root = new URL("..", import.meta.url).pathname;
const port = Number(process.argv[2] || process.env.PORT || 8000);
const config = JSON.parse(await readFile(join(root, "vercel.json"), "utf8"));
const ignored = parseVercelIgnore(await readFile(join(root, ".vercelignore"), "utf8"));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".pdf": "application/pdf",
};
const COMPRESSIBLE = new Set([".html", ".css", ".js", ".mjs", ".json", ".webmanifest", ".svg", ".txt", ".xml"]);

// "/css/(.*)" do vercel.json → regex ancorada. Quando várias regras dão a mesma chave, ganha a última.
const headerRules = (config.headers || []).map((rule) => ({
  pattern: new RegExp(`^${rule.source}$`),
  headers: rule.headers,
}));

/** Caminhos que o .vercelignore deixa de fora (linhas `/caminho`; `#` são comentários). */
function parseVercelIgnore(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.replace(/\/$/, ""));
}

const isIgnored = (path) => ignored.some((entry) => path === entry || path.startsWith(`${entry}/`));

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

// Devolve { file, status } ou { redirect } para um caminho do URL.
async function resolvePath(pathname) {
  const redirect = (config.redirects || []).find((rule) => rule.source === pathname);
  if (redirect) return { redirect: redirect.destination };
  if (config.cleanUrls) {
    if (pathname.endsWith(".html")) {
      const clean = pathname.slice(0, -".html".length);
      return { redirect: clean.endsWith("/index") ? clean.slice(0, -"/index".length) || "/" : clean };
    }
    if (pathname !== "/" && pathname.endsWith("/") && config.trailingSlash === false) {
      return { redirect: pathname.slice(0, -1) };
    }
  }
  if (isIgnored(decodeURIComponent(pathname))) {
    return { file: join(root, "404.html"), status: 404 };
  }
  const local = normalize(join(root, decodeURIComponent(pathname)));
  if (!local.startsWith(root)) return { file: join(root, "404.html"), status: 404 };
  if (pathname.endsWith("/") && (await isFile(join(local, "index.html")))) {
    return { file: join(local, "index.html"), status: 200 };
  }
  if (await isFile(local)) return { file: local, status: 200 };
  if (config.cleanUrls && (await isFile(join(local, "index.html")))) return { file: join(local, "index.html"), status: 200 };
  if (config.cleanUrls && (await isFile(`${local}.html`))) return { file: `${local}.html`, status: 200 };
  return { file: join(root, "404.html"), status: 404 };
}

// Comprime cada ficheiro uma vez (como a CDN da Vercel, que serve já comprimido). O brotli no nível
// máximo demora centenas de ms num CSS grande e atrasaria cada pedido.
const compressedCache = new Map();
function compressed(file, body, encoding) {
  const key = `${encoding}:${file}`;
  const cached = compressedCache.get(key);
  if (cached && cached.source.equals(body)) return cached.data;
  const data = encoding === "br" ? brotliCompressSync(body) : gzipSync(body);
  compressedCache.set(key, { source: body, data });
  return data;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const target = await resolvePath(url.pathname);
  if (target.redirect) {
    res.writeHead(308, { Location: target.redirect + url.search });
    res.end();
    return;
  }

  const ext = extname(target.file);
  let body = await readFile(target.file);
  const headers = { "Content-Type": TYPES[ext] || "application/octet-stream" };
  for (const rule of headerRules) {
    if (rule.pattern.test(url.pathname)) {
      for (const { key, value } of rule.headers) headers[key] = value;
    }
  }

  const accepts = req.headers["accept-encoding"] || "";
  if (COMPRESSIBLE.has(ext)) {
    headers.Vary = "Accept-Encoding";
    const encoding = /\bbr\b/.test(accepts) ? "br" : /\bgzip\b/.test(accepts) ? "gzip" : null;
    if (encoding) {
      body = compressed(target.file, body, encoding);
      headers["Content-Encoding"] = encoding;
    }
  }
  headers["Content-Length"] = body.length;
  res.writeHead(target.status, headers);
  res.end(req.method === "HEAD" ? undefined : body);
});

// Com a porta 0 o sistema escolhe uma livre (os testes usam isto); a linha mostra a porta real.
server.listen(port, () => console.log(`http://localhost:${server.address().port}/`));
