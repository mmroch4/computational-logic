# Plano da migração para monorepo

Cada `### [ ]` é uma tarefa, feita por uma sessão nova. O `ralph/run.sh` marca-as e para nas `PAUSA`.
O detalhe e os motivos estão em `ralph/MONOREPO-PLAN.md`.

## Tarefas

### [x] M0 · Linha de base
Corre os testes das duas pastas sem alterar nada e regista em `ralph/NOTES.md` quantos passam, quais
falham e quanto demoram. É aqui que se confirma se as 3 falhas por tempo da dedução natural eram mesmo
da carga da máquina.
**Feito quando:** as duas suites passam numa corrida limpa. Se o SAT falhar antes de qualquer alteração,
ou a dedução natural falhar de forma repetível, a sessão bloqueia: não corrige nada nesta tarefa.

### [x] M1 · Raiz do repositório
Cria `.gitignore`, `LICENSE`, `CLAUDE.md` e `scripts/test-all.sh`. O script corre as duas suites em
série, com saída clara e código de erro correto.
**Feito quando:** `scripts/test-all.sh` passa, e falha se uma das suites falhar.

### [x] M2 · Serviços e isolamento das pastas
Procura caminhos que assumam a raiz do repositório: `repository` nos `package.json`, `.vercelignore`,
`scripts/serve.mjs`, `tests/deploy.test.js`, `tests/docs.test.js`. Na dedução natural, mantém a regra
de `.vercelignore`. Confirma que correr cada `npm test` numa pasta não depende da outra.
**Feito quando:** cada pasta passa os testes sozinha, e `scripts/smoke-deploy.sh` local passa nas duas.

### [x] M3 · A referência passa a ser `../sat`
Na dedução natural, muda o `CLAUDE.md` para referir `../sat` em vez de `.reference/sat/`, mantendo a
regra de não importar dele em runtime e a de não misturar alterações. Arquiva `natural-deduction/ralph/`
em `ralph/archive/natural-deduction/`. Mantém as entradas do `.vercelignore` e o teste de deploy.
**Feito quando:** não existe `natural-deduction/ralph/`, e os testes e os `docs.test.js` passam.

### [x] M4 · Documentação
Escreve o `README.md` da raiz, em inglês, com as duas ferramentas. Corrige no `README.md` da dedução
natural o caminho de clonar e o «Live site», que só deve surgir quando o endereço existir. Atualiza a
secção Publicação do `SPEC.md`. No SAT, autorizado nesta tarefa, só o que depender de caminhos.
**Feito quando:** todos os links relativos resolvem, e os `docs.test.js` passam.

### [x] M5 · Hub
Cria `hub/`: página estática em PT (`/`) e EN (`/en`), com as duas ferramentas, créditos como no SAT,
sem framework nem build, com `vercel.json`, CSP e testes `node --test`.
**Feito quando:** os testes passam, a página valida a 390px e `hub/` entra no `scripts/test-all.sh`.

### [x] PAUSA-1 · Revisão antes de publicar
Revês `git log` e `git diff ac9dfe8..monorepo --stat -- sat/`. Se estiver bem, segue a etapa 6.1 e 6.2.
O loop retoma quando os três sites estiverem no ar.

### [x] M6 · Ligações entre as ferramentas
**Só depois de os três sites estarem no ar.** Acrescenta nos dois rodapés links para o hub e para a outra
ferramenta, levanta a regra do `CLAUDE.md` do SAT que proibia ligar ao hub, com
as strings em ambos os locales, EN gerado pelo `build:pages`, e testes. É a única alteração visível ao
SAT, autorizada nesta tarefa, com um commit próprio.
**Feito quando:** o link aparece em todas as páginas PT e EN, a 390px, sem scroll horizontal, com as
verificações de página a passar nas duas pastas.

### [x] M7 · Identidade e SEO do hub
Pedido do Miguel: o hub tem SEO, Open Graph e favicons próprios, sem copiar nada de uma das ferramentas.
Só muda `hub/` e o `ralph/NOTES.md`. Mantém o hub sem JavaScript e sem passo de build, com os ficheiros
gerados no repositório e PT e EN em todo o texto.
- Identidade: abre `hub/favicon.svg`, `sat/favicon.svg` e `natural-deduction/favicon.svg`. Se o do hub for
  uma variação de um dos outros, redesenha-o com uma marca que represente a lógica computacional no seu
  conjunto, sem reutilizar os elementos gráficos das ferramentas. Regista a decisão nas notas.
- Modelos próprios em `hub/scripts/share-images/` e `hub/scripts/make-share-images.sh`, escritos para o
  hub, que geram `og-image.png` e `og-image-en.png` (1200×630) e `apple-touch-icon.png` (180×180). As
  imagens têm composição própria, com o nome «Computational Logic» e sem screenshots das ferramentas.
  Vê os PNG gerados com a ferramenta Read: o texto tem de caber e ler-se.
- `site.webmanifest` próprio, com o nome do hub, e `<link>` para o manifest e o `apple-touch-icon`.
- Em `index.html` e `en/index.html`: `og:image` com URL absoluto da imagem na língua da página,
  `og:image:width`, `og:image:height`, `og:image:alt`, e `twitter:card` = `summary_large_image`, com
  `twitter:title`, `twitter:description`, `twitter:image` e `twitter:image:alt`.
- JSON-LD em cada língua: `WebSite` e uma `ItemList` ou `CollectionPage` com as duas ferramentas. Confirma
  no Chrome que a CSP de `hub/vercel.json` não gera erros na consola; muda a CSP só se for preciso, sem
  permitir scripts executáveis. A 404 mantém `noindex`, sem JSON-LD.
- Cabeçalhos do `hub/vercel.json`: `content-type` certo no manifest e cache de 86400 s nas imagens de
  partilha, como no SAT. Confirma que o `.vercelignore` serve as imagens e o manifest.
- Testes em `hub/tests/`: todas as tags nas duas línguas, com URLs absolutos e o idioma certo; PNG com as
  dimensões certas; JSON-LD válido; e hub com hash diferente do SAT e da dedução natural para `favicon.svg`,
  `og-image*.png`, `apple-touch-icon.png` e `site.webmanifest`.
**Feito quando:** os testes do hub e o `scripts/test-all.sh` passam, `sat/` e `natural-deduction/` não
mudam, as imagens foram vistas, e as páginas validam a 390px sem erros na consola.

### [ ] PAUSA-2 · Revisão final
Revês as ligações e a identidade do hub, antes de as publicares.
