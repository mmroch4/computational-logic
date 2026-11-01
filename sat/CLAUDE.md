# Learn Davis-Putnam SAT — ferramenta didática

Ferramenta web estática para **qualquer pessoa** aprender o algoritmo de Davis-Putnam (DLL/DPLL).
Publicado em https://sat.computational-logic.miguelrocha.dev. Código em
https://github.com/mmroch4/computational-logic.

## Stack e restrições

- HTML estático + ES modules nativos, **sem framework JS**. CSS com **Tailwind CSS v4 + Basecoat**
  (versões exatas em `devDependencies`). Os únicos passos de build são o do CSS, o das páginas e o do vendor (ver abaixo), e os resultados são
  **commitados** (`css/src/app.css` compila para `css/app.css`), por isso a Vercel e o `scripts/serve.mjs` só
  servem os ficheiros, sem compilar nada. Do Basecoat entram só os componentes usados: os `@import` do topo do
  `app.css` e `css/src/basecoat-vega.css`, uma parte do tema original (ao atualizar a versão, refazer os dois). Deploy estático na Vercel: o `vercel.json` tem `cleanUrls`, redirecionamentos, cache, headers de segurança e a CSP; o `.vercelignore` só deixa passar o site.
- A CSP não deixa scripts inline (`script-src 'self'`): o que tem de correr no `<head>` vive em `js/boot.js`, com a entrada da página em `data-entry`. Os blocos JSON-LD são dados e passam.
- Dependências novas só com um bom motivo, sempre com versão fixa; o JS do site não depende de
  `node_modules` (código de terceiros, se for preciso, vai para `js/vendor/`). Fontes via Google Fonts.
- Movimento só pelo `js/ui/motion.js`, o único que importa o `js/vendor/motion-mini.js` (gerado por
  `npm run build:vendor` com `motion` e `esbuild`, commitado, como o CSS). O sistema está no `DESIGN.md`, em «Movimento».
- Classes Tailwind escritas por inteiro no código (nada de `"bg-ev-" + tipo`): o Tailwind só gera o que encontra.
- `js/core/` é puro (sem DOM, sem `window`, sem `localStorage`) e testável com `node --test`.
  Toda a lógica do algoritmo vive aqui; a UI só consome os traces.
- `js/ui/` = componentes DOM reutilizáveis; `js/pages/` = um entry por página HTML.
- Vercel Web Analytics em `js/ui/analytics.js`: só carrega quando o `location.hostname` é o do `SITE_URL`, por isso nunca corre localmente nem nas previews.
- localStorage só através de `js/ui/storage.js` (chaves `dpsat:v1:*`, tudo em try/catch, a página
  funciona sem ele).

## Comandos

- Testes: `npm test` (= `node --test 'tests/**/*.test.js'`; no Node 26 `node --test tests/` falha porque trata a pasta como ficheiro). Ficheiros de teste: `tests/*.test.js`. Snapshots em `tests/snapshots/` (regravar com `UPDATE_SNAPSHOTS=1 npm test`).
- CSS: `npm run build:css` (compila e minifica o `css/app.css`; correr depois de mexer em classes e fazer commit
  do resultado) e `npm run watch:css` (recompila ao gravar, **sem minificar**: correr o `build:css` antes do
  commit). O `tests/css-build.test.js` falha se o `css/app.css` commitado não for o que o build gera.
- Páginas EN e SEO: `npm run build:pages` gera os `en/*.html`, o `sitemap.xml`, o `robots.txt` a partir das páginas PT e do `en.js`, e o bloco de SEO do `<head>` (entre `<!-- seo -->` e `<!-- /seo -->`) nas páginas dos dois idiomas, a partir das chaves `meta.<página>.*` (correr depois de mexer nas páginas ou nos locales e fazer commit do resultado; e o rodapé estático (`<!-- footer -->`); nunca editar `en/` nem esses blocos à mão). O `tests/build-pages.test.js` falha se estiverem desatualizados.
- Vendor: `npm run build:vendor` regenera o `js/vendor/motion-mini.js` (só depois de mudar a versão do `motion`).
- Servidor local: `node scripts/serve.mjs 8765` → http://localhost:8765/ (imita a Vercel, a partir do `vercel.json` e do `.vercelignore`). O `python3 -m http.server` não tem `cleanUrls`: nem `/resolver` nem as páginas EN abrem nele. Os `check-*.sh` arrancam o `serve.mjs` se a porta estiver livre.
- Porta: os `check-*.sh` usam `PORT` (por omissão 8000; ex.: `PORT=8765 scripts/check-page.sh /`). Se encontrarem um servidor antigo na porta, usam-no: um `http.server` dá 404 nos caminhos limpos, e nesse caso escolhe-se outra `PORT`.
- Verificação visual: `scripts/check-page.sh <caminho> [pasta-saída]` usa o Chrome headless
  (`/usr/bin/google-chrome`, ou o de `CHROME_BIN`) para tirar screenshots a 1280px e 390px e falha se houver erros na consola.
  Sem pasta, as screenshots vão para `tmp/screens/` (ignorada pelo git). As screenshots podem ser abertas com a ferramenta Read para inspeção visual. Com `PDF=1` também imprime a página
  para PDF (como o "Exportar PDF"); converter com `pdftoppm -r 50 -png <pdf> <prefixo>` para ver.
  Com `REDUCED_MOTION=1` emula `prefers-reduced-motion: reduce` e falha se houver transições/animações.
  Com `BLOCK_STORAGE=1` o `localStorage` lança SecurityError (a página tem de funcionar sem ele).
  Com `MEASURE=1` escreve o peso transferido por tipo de recurso e as fontes usadas/descarregadas (`scripts/font-usage.mjs`).
- Todas as páginas: `scripts/check-all.sh [pasta-saída]` (as 10 páginas e a 404, em modo normal, com movimento reduzido e com o `localStorage` bloqueado).
- Verificação do Resolver: `scripts/check-resolver.sh [pasta-saída]` (10 exemplos base, 2 erros, link partilhado, Limpar e menu Exportar). Com `EN=1` corre no caminho EN, tal como o `check-step.sh` e o `check-exercises.sh`.
- Verificação dos Exercícios: `scripts/check-exercises.sh [pasta-saída]` (lista, os dois modos até ao fim, progresso depois de recarregar, repor e localStorage bloqueado).
- Teclado: `scripts/check-keyboard.sh` (Tab a sério nas páginas PT e EN a 1280 e 390px, com foco visível e sem ficar preso; menus e folhas com Enter, Tab e Esc; timeline e exercícios). A auditoria do `check-page.sh` também falha com alvos < 44px a 390px.
- Casos-limite: `scripts/check-edge.sh [pasta-saída]` (idioma trocado a meio do play, que navega e mantém o estado, players do Aprender, 404 nos dois idiomas, localStorage bloqueado).
- Imagens de partilha: `scripts/make-share-images.sh` regenera `og-image.png`, `og-image-en.png` e `apple-touch-icon.png` a partir de `scripts/share-images/*.html` (correr se o nome ou o visual mudarem).
- Lighthouse: `scripts/lighthouse.sh [pasta-saída]` (10 páginas e a 404, mobile, falha abaixo de `MIN=95` ou com SEO < 100 numa página indexável; quem falha repete e conta a mediana de 3; usa `npx --yes lighthouse@12` e a rede).
  Serve o site com `node scripts/serve.mjs [porta]`, que imita a Vercel (compressão, `cleanUrls`, headers do `vercel.json`, 404).
- Smoke test do deploy: `scripts/smoke-deploy.sh [url-base]` (rotas, redirecionamentos, 404, tipos e headers com `curl`; sem url-base usa o `serve.mjs`, com ela corre contra esse site).
- Módulos: depois de mudar imports, `node scripts/modulepreload.mjs` regenera os `<link rel="modulepreload">` das páginas (há teste).
- Verificação do Passo a passo: `scripts/check-step.sh [pasta-saída]` (conjuntos (1)–(4) da cadeia de propagações, árvores completas dos dois ramos e dos pombos).

## Convenções do algoritmo

```
DLL(S)
  S := propagate(S)
  if S vazio then return satisfazível
  if S contém F then return insatisfazível
  l := select_literal(S)
  if DLL(S ∪ {l}) = satisfazível then return satisfazível
  else return DLL(S ∪ {l̃})
```

- Propagação unitária: um literal por evento; usa a **primeira cláusula unitária pela ordem do conjunto**.
- `select_literal`: primeira variável em **ordem alfabética natural** (p2 < p11), **ramo positivo primeiro**
  (uma regra fixa, fácil de seguir à mão).
- Um conjunto é um conjunto: cláusulas e literais repetidos colapsam (com aviso).
- Tautologias **não** são removidas no DLL, apenas sinalizadas (poderiam ser, sem mudar a resposta).
- Cláusula vazia é mostrada como **F**. Valores de verdade: **V/F** (PT) e **T/F** (EN).
- Variáveis: `[A-Za-z][A-Za-z0-9_]*`; sufixo numérico renderizado em subscrito (`p11` → p₁₁).

## Notações de entrada (detetadas automaticamente)

1. Compacta: `p1, -p1 -p2, p3 p2`
2. Conjuntos: `{{p, ¬q}, {q}}` ou com disjunções `{p ∨ ¬q, q}`
3. Lógica: `(p ∨ ¬q) ∧ q`

Negação `¬ ~ - !` · disjunção `∨ | \/ v` (`v` só como token isolado) · conjunção `∧ & /\ ^`.

## Rotas e idiomas

| PT | EN |
| --- | --- |
| `/` | `/en` |
| `/aprender` | `/en/learn` |
| `/resolver` | `/en/solver` |
| `/passo-a-passo` | `/en/step-by-step` |
| `/exercicios` | `/en/exercises` |

- O mapa vive em `js/core/routes.js` (`pathFor`, `langFromPath`, `counterpartPath`, `sitemapEntries`).
- O idioma vem **só do URL**, nunca do navegador nem do `localStorage`, e não há redirecionamentos por
  idioma. O seletor navega para a página equivalente e leva a query e o hash. O `404.html` é só um e
  escolhe o idioma pelo caminho pedido.
- As páginas PT são a fonte, escrita à mão; as `en/*.html` são geradas.
- Cada página tem título, descrição, canonical limpo, `hreflang` (`x-default` → EN) e JSON-LD gerados pelo
  `build:pages`. Nada de `isPartOf` nem de links para o hub `computational-logic.miguelrocha.dev`, que
  ainda não existe.

## UI

- Sistema visual no `DESIGN.md`; a fonte dos tokens é o `css/src/app.css`.
  Minimalista claro. Mobile importa: validar a 390px.
- i18n: todas as strings visíveis em `js/ui/locales/{pt,en}.js`. **PT é português de Portugal (PT-PT)**
  com a terminologia habitual: satisfazível, insatisfazível, valoração, cláusula unitária, propagação,
  ficheiro, ecrã, carregar (botão), "experimenta", "tens"/"podes" (tratar o leitor por tu).
- Créditos obrigatórios na **barra de créditos do topo** ("Plataforma criada por Miguel Rocha · miguelrocha.dev",
  por cima do header, que já não leva crédito) **e no rodapé**: "Desenvolvido por Miguel Rocha · miguelrocha.dev"
  com link para https://miguelrocha.dev.
- Nome da ferramenta numa única constante `APP_NAME` em `js/ui/config.js` e URL público em `SITE_URL`, no mesmo ficheiro.
