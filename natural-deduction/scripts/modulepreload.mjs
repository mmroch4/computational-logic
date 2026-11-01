// Gera, em cada página HTML, os <link rel="modulepreload"> de todos os módulos que o entry importa
// (direta ou indiretamente). Sem bundle, o browser só descobre um import depois de descarregar o
// módulo que o pede: index.js → layout.js → i18n.js → locales/pt.js são 4 idas à rede seguidas.
// Com o preload, a página pede-os todos logo ao ler o <head>.
//
// Uso: node scripts/modulepreload.mjs   (reescreve o bloco entre os marcadores em cada *.html)
// O tests/modulepreload.test.js falha se algum HTML ficar desatualizado.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MARK_START = "<!-- modulepreload (gerado por scripts/modulepreload.mjs) -->";
export const MARK_END = "<!-- /modulepreload -->";

// `import … from "x"`, `export … from "x"` e `import "x"` (só imports estáticos: um import() carrega depois do primeiro desenho).
const IMPORT_RE = /^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']/gm;

export function importsOf(source) {
  return [...source.matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2]);
}

// Módulos que o entry carrega (sem o próprio entry), por ordem de descoberta (largura primeiro).
// Os caminhos são os do site ("/js/ui/layout.js").
export function moduleGraph(entry, readModule = (path) => readFileSync(join(ROOT, path), "utf8")) {
  const seen = new Set([entry]);
  const queue = [entry];
  const order = [];
  while (queue.length) {
    const current = queue.shift();
    for (const spec of importsOf(readModule(current))) {
      const path = posix.normalize(posix.join(posix.dirname(current), spec));
      if (seen.has(path)) continue;
      seen.add(path);
      order.push(path);
      queue.push(path);
    }
  }
  return order;
}

export function entryOf(html) {
  return html.match(/<script type="module" src="([^"]+)"><\/script>/)?.[1] ?? null;
}

// O bloco que deve estar no HTML: o entry e os módulos que ele importa.
export function preloadBlock(entry, modules, indent = "  ") {
  const links = [entry, ...modules].map((path) => `${indent}<link rel="modulepreload" href="${path}">`);
  return [`${indent}${MARK_START}`, ...links, `${indent}${MARK_END}`].join("\n");
}

// Devolve o HTML com o bloco atualizado (antes do <script type="module">).
export function withPreloads(html, readModule) {
  const entry = entryOf(html);
  if (!entry) return html;
  const block = preloadBlock(entry, moduleGraph(entry, readModule));
  const existing = new RegExp(`[ \\t]*${escapeRegex(MARK_START)}[\\s\\S]*?${escapeRegex(MARK_END)}`);
  if (existing.test(html)) return html.replace(existing, block);
  return html.replace(/([ \t]*)<script type="module" src=/, (_, indent) => `${block}\n${indent}<script type="module" src=`);
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function htmlPages() {
  const pages = (dir) => readdirSync(join(ROOT, dir)).filter((name) => name.endsWith(".html"));
  return [...pages("."), ...pages("en").map((name) => `en/${name}`)];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const name of htmlPages()) {
    const file = join(ROOT, name);
    const before = readFileSync(file, "utf8");
    const after = withPreloads(before);
    if (after !== before) {
      writeFileSync(file, after);
      console.log(`atualizado: ${name}`);
    }
  }
}
