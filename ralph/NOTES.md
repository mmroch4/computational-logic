# Notas entre sessões

Decisões e armadilhas que afetam tarefas futuras. Uma linha por nota.

- A1: `css/src/app.css` só traz tokens, `:root`, `@layer base`, foco e `.skip-link`, sem as 7000 linhas de componentes do SAT. Quem criar um componente (`.credits`, `.hdr`, `.btn`, `.msg`, menus, folha, tab bar, rodapé) copia a secção de `.reference/sat/css/src/app.css`. O `basecoat-vega.css` tem só Button, Textarea, Input, Select e Card.
- A1: `cp` em bloco a partir de `.reference/` foi recusado pelas permissões; os ficheiros foram escritos com Write. O `package-lock.json` foi gerado pelo `npm install`, não copiado do SAT.
- A1: `index.html` e `404.html` são provisórios, para o `serve.mjs` responder (sem `404.html` ele rebenta). A A3 substitui-os. `build:pages` só funciona depois da A3.
- A2: para o `i18n` e o `layout` carregarem, já existem `js/core/routes.js` (id da página Provar: `prove`), `js/ui/segmented.js`, `js/ui/sheet.js` e locales só com o shell e `meta.*`. A A3 acrescenta o resto a estes ficheiros. O CSS do shell (`.credits`, `.hdr`, `.btn`, `.seg`, `.msg`, menus, folha, rodapé, tab bar) já está no `app.css`; o `.play` ficou de fora, para a F1.
- A2: token `--color-ev-sat` passou a `--color-ev-ok`, e `--color-tree-future` a `--color-grip`. O histórico guarda `{ sequent, savedAt }`. Saíram o `splitSymbols` e o `.sym`, que eram só do SAT. O `tests/no-sat-references.test.js` varre `js/` e `DESIGN.md`.
- A1: `.vercelignore` também exclui `/conteudos`, `/ralph` e `/SPEC.md`. O `npm install` avisa que os install scripts do esbuild e do `@parcel/watcher` não correram, mas os builds funcionam.
