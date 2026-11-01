// Gera o js/vendor/motion-mini.js: o `animate` do motion/mini num só ESM minificado, com a licença
// no cabeçalho. O resultado é commitado (a Vercel e o `python3 -m http.server` não compilam nada).
// Uso: npm run build:vendor (depois de atualizar a versão do motion nas devDependencies).
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const { version } = JSON.parse(readFileSync(new URL("node_modules/motion/package.json", root), "utf8"));
const license = readFileSync(new URL("node_modules/motion/LICENSE.md", root), "utf8").trim();

await build({
  stdin: { contents: 'export { animate } from "motion/mini";', resolveDir: root.pathname },
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2020",
  legalComments: "none",
  banner: { js: `/*! motion ${version} (motion/mini) · https://motion.dev\n\n${license}\n*/` },
  outfile: new URL("js/vendor/motion-mini.js", root).pathname,
});
