# Notas entre sessões

Decisões e armadilhas que afetam tarefas futuras. Uma linha por nota.

- A1: `css/src/app.css` só traz tokens, `:root`, `@layer base`, foco e `.skip-link`, sem as 7000 linhas de componentes do SAT. Quem criar um componente (`.credits`, `.hdr`, `.btn`, `.msg`, menus, folha, tab bar, rodapé) copia a secção de `.reference/sat/css/src/app.css`. O `basecoat-vega.css` tem só Button, Textarea, Input, Select e Card.
- A1: `cp` em bloco a partir de `.reference/` foi recusado pelas permissões; os ficheiros foram escritos com Write. O `package-lock.json` foi gerado pelo `npm install`, não copiado do SAT.
- A1: `index.html` e `404.html` são provisórios, para o `serve.mjs` responder (sem `404.html` ele rebenta). A A3 substitui-os. `build:pages` só funciona depois da A3.
- A2: para o `i18n` e o `layout` carregarem, já existem `js/core/routes.js` (id da página Provar: `prove`), `js/ui/segmented.js`, `js/ui/sheet.js` e locales só com o shell e `meta.*`. A A3 acrescenta o resto a estes ficheiros. O CSS do shell (`.credits`, `.hdr`, `.btn`, `.seg`, `.msg`, menus, folha, rodapé, tab bar) já está no `app.css`; o `.play` ficou de fora, para a F1.
- A2: token `--color-ev-sat` passou a `--color-ev-ok`, e `--color-tree-future` a `--color-grip`. O histórico guarda `{ sequent, savedAt }`. Saíram o `splitSymbols` e o `.sym`, que eram só do SAT. O `tests/no-sat-references.test.js` varre `js/` e `DESIGN.md`.
- A3: ordem dos builds depois de mudar páginas ou imports: `node scripts/modulepreload.mjs`, depois `npm run build:pages` (o EN copia o bloco de preload do PT). O `htmlPages()` precisa da pasta `en/`.
- A3: as páginas ainda não ligam favicon, apple-touch-icon nem manifest, e `/og-image*.png` são citados no `<head>` mas não existem. A H3 cria-os, acrescenta os `<link>` às 6 páginas PT e repõe em `tests/meta.test.js` os testes do SAT para isso. Até lá, o Chrome pede `/favicon.ico` e dá 404 na consola: a A4 tem de contar com isso.
- A3: títulos em `meta.*` encurtados para caberem nos 60 caracteres com o nome. O `.empty-state` e o `.page-empty` são provisórios: cada página substitui-os quando tiver conteúdo, e o teste do estado vazio em `tests/pages.test.js` muda com ela. A H1 faz o mesmo no início.
- A3: o JSON-LD da lição não leva `timeRequired`: acrescenta-o quando a lição anunciar a duração.
- A1: `.vercelignore` também exclui `/conteudos`, `/ralph` e `/SPEC.md`. O `npm install` avisa que os install scripts do esbuild e do `@parcel/watcher` não correram, mas os builds funcionam.
