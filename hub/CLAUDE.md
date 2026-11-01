# Hub — página de entrada

Página estática que apresenta as ferramentas e liga para elas. Destino:
https://computational-logic.miguelrocha.dev.

- HTML e CSS escritos à mão, sem JS, sem framework, sem build e sem dependências. A CSP tem
  `script-src 'none'`: nada de scripts nem de estilos inline. A única exceção é o bloco de dados JSON-LD,
  que o browser não executa.
- Identidade própria, sem nada copiado das ferramentas (o `tests/identity.test.js` compara os hashes). A
  marca é o reticulado de Boole gerado por p e q: um losango com quatro nós, em `favicon.svg`.
- PT em `index.html` (`/`, fonte PT-PT, a tratar o leitor por tu) e EN em `en/index.html` (`/en`). Sem
  `build:pages`: mudar uma é mudar a outra à mão. O `tests/site.test.js` compara-as.
- O idioma vem só do URL, e cada idioma liga ao mesmo idioma das ferramentas.
- Créditos como no SAT, na barra do topo e no rodapé, com link para https://miguelrocha.dev.
- Valores visuais em `css/app.css`, copiados do `sat/css/src/app.css`. Validar a 390px.
- `scripts/` é uma cópia do SAT (nenhuma pasta importa código de outra).

## Comandos

- Testes: `npm test`.
- Servidor local: `node scripts/serve.mjs 8765`.
- Imagens de partilha: `scripts/make-share-images.sh`, se mudar um modelo em `scripts/share-images/`; os
  PNG são commitados e nenhum teste deteta um PNG desatualizado.
- Verificação visual: `scripts/check-page.sh <caminho> [pasta-saída]`, com as opções do SAT; screenshots em
  `tmp/screens/`.
