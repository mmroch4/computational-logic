// A identidade do hub: imagens de partilha, Open Graph, Twitter, JSON-LD e manifest, nos dois idiomas,
// e a garantia de que nada disto é copiado de uma das ferramentas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");
const bytes = (file, base = root) => readFileSync(new URL(file, base));
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

const HUB = "https://computational-logic.miguelrocha.dev";
const SAT = "https://sat.computational-logic.miguelrocha.dev";
const ND = "https://nd.computational-logic.miguelrocha.dev";
const PAGES = {
  pt: {
    file: "index.html",
    url: `${HUB}/`,
    image: `${HUB}/og-image.png`,
    inLanguage: "pt-PT",
    alt: /aprende lógica computacional/,
    tools: [`${SAT}/`, `${ND}/`],
  },
  en: {
    file: "en/index.html",
    url: `${HUB}/en`,
    image: `${HUB}/og-image-en.png`,
    inLanguage: "en",
    alt: /learn computational logic/,
    tools: [`${SAT}/en`, `${ND}/en`],
  },
};

const attribute = (html, name, value) => {
  const match = html.match(new RegExp(`<meta ${name}="${value}" content="([^"]*)">`));
  assert.ok(match, `falta ${value}`);
  return match[1];
};
const og = (html, key) => attribute(html, "property", key);
const twitter = (html, key) => attribute(html, "name", key);
const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((match) => JSON.parse(match[1]));

for (const [id, page] of Object.entries(PAGES)) {
  const html = read(page.file);

  test(`${id}: Open Graph com a imagem do idioma da página, em URL absoluto`, () => {
    assert.equal(og(html, "og:image"), page.image);
    assert.equal(og(html, "og:image:width"), "1200");
    assert.equal(og(html, "og:image:height"), "630");
    assert.match(og(html, "og:image:alt"), page.alt);
  });

  test(`${id}: Twitter com o mesmo título, descrição e imagem do Open Graph`, () => {
    assert.equal(twitter(html, "twitter:card"), "summary_large_image");
    assert.equal(twitter(html, "twitter:title"), og(html, "og:title"));
    assert.equal(twitter(html, "twitter:description"), og(html, "og:description"));
    assert.equal(twitter(html, "twitter:image"), page.image);
    assert.equal(twitter(html, "twitter:image:alt"), og(html, "og:image:alt"));
  });

  test(`${id}: liga ao manifest e ao apple-touch-icon`, () => {
    assert.ok(html.includes('<link rel="manifest" href="/site.webmanifest">'));
    assert.ok(html.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png">'));
  });

  test(`${id}: JSON-LD válido, com o WebSite e as duas ferramentas no idioma da página`, () => {
    const blocks = jsonLd(html);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]["@context"], "https://schema.org");
    const byType = Object.fromEntries(blocks[0]["@graph"].map((node) => [node["@type"], node]));

    assert.equal(byType.WebSite.name, "Computational Logic");
    assert.equal(byType.WebSite.url, page.url);
    assert.equal(byType.WebSite.inLanguage, page.inLanguage);
    assert.equal(byType.WebSite.description, og(html, "og:description"));
    assert.equal(byType.WebSite.author.url, "https://miguelrocha.dev");

    assert.equal(byType.CollectionPage.url, page.url);
    assert.equal(byType.CollectionPage.inLanguage, page.inLanguage);
    const list = byType.CollectionPage.mainEntity;
    assert.equal(list["@type"], "ItemList");
    assert.equal(list.numberOfItems, 2);
    assert.deepEqual(list.itemListElement.map((item) => [item["@type"], item.position, item.name, item.url]), [
      ["ListItem", 1, "Learn Davis-Putnam SAT", page.tools[0]],
      ["ListItem", 2, "Learn Natural Deduction", page.tools[1]],
    ]);
  });
}

test("a imagem de cada idioma é outra: o og-image-en.png não é uma cópia", () => {
  assert.notEqual(sha256(bytes("og-image.png")), sha256(bytes("og-image-en.png")));
});

test("a 404 mantém o noindex e não tem JSON-LD nem Open Graph", () => {
  const html = read("404.html");
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  assert.doesNotMatch(html, /<script\b/);
  assert.doesNotMatch(html, /og:|twitter:/);
});

test("PNG com as dimensões certas", () => {
  const sizes = { "og-image.png": [1200, 630], "og-image-en.png": [1200, 630], "apple-touch-icon.png": [180, 180] };
  for (const [file, size] of Object.entries(sizes)) {
    const png = bytes(file);
    assert.equal(png.toString("latin1", 1, 4), "PNG", file);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], size, file);
  }
});

test("site.webmanifest com o nome do hub e ícones que existem", () => {
  const manifest = JSON.parse(read("site.webmanifest"));
  assert.equal(manifest.name, "Computational Logic");
  assert.equal(manifest.start_url, "/");
  assert.match(manifest.description, /Learn computational logic/);
  assert.match(manifest.description, /Aprende lógica computacional/);
  assert.deepEqual(manifest.icons.map((icon) => icon.src), ["/apple-touch-icon.png", "/favicon.svg"]);
  for (const icon of manifest.icons) assert.ok(existsSync(new URL(icon.src.slice(1), root)), icon.src);
});

test("os modelos das imagens não têm JS, como o resto do hub", () => {
  for (const file of ["og-image.html", "apple-touch-icon.html"]) {
    assert.doesNotMatch(read(`scripts/share-images/${file}`), /<script\b/, file);
  }
});

// As outras pastas não são precisas para testar o hub sozinho: sem elas, estes testes ficam saltados.
for (const [tool, folder] of Object.entries({ SAT: "sat", "dedução natural": "natural-deduction" })) {
  const base = new URL(`../${folder}/`, root);
  const skip = existsSync(base) ? false : `sem ../${folder}`;

  test(`nenhum ficheiro de identidade é igual a um da ferramenta: ${tool}`, { skip }, () => {
    const files = ["favicon.svg", "og-image.png", "og-image-en.png", "apple-touch-icon.png", "site.webmanifest"];
    const theirs = new Set(files.filter((file) => existsSync(new URL(file, base))).map((file) => sha256(bytes(file, base))));
    assert.ok(theirs.size >= 4, "encontrou os ficheiros da ferramenta");
    for (const file of files) assert.ok(!theirs.has(sha256(bytes(file))), file);
  });

  // O hash não chega: bastava mudar um número para o favicon ser outra variação do mesmo desenho.
  test(`o favicon não reutiliza formas nem o azulejo da ferramenta: ${tool}`, { skip }, () => {
    const paths = (svg) => [...svg.matchAll(/\sd="([^"]+)"/g)].map((match) => match[1].split(/(?=[a-zA-Z])/));
    const theirs = new Set(paths(readFileSync(new URL("favicon.svg", base), "utf8")).flat());
    const ours = paths(read("favicon.svg")).flat();
    assert.ok(ours.length > 0, "encontrou o desenho");
    for (const segment of ours) assert.ok(!theirs.has(segment), segment);
    assert.doesNotMatch(read("favicon.svg"), /<rect\b/);
  });
}
