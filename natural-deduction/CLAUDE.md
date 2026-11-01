# Learn Natural Deduction

Site público para aprender provas no sistema DN em notação de Fitch. A especificação é o `SPEC.md`.
Em caso de conflito, a ordem é: `SPEC.md`, depois este ficheiro, depois `../sat`.
O sistema visual está no `DESIGN.md`, e a documentação pública, em inglês, no `README.md`.

## Restrições

- HTML estático + ES modules nativos, sem framework JS. CSS com Tailwind v4 + Basecoat.
- `../sat` é a ferramenta SAT, noutro pacote do monorepo. Usa-a como referência de convenções e copia
  dela o que precisares. Nunca importes dela em runtime. Só de leitura neste trabalho: uma alteração ao
  SAT é um commit à parte, sem misturar com a dedução natural.
- `js/core/` é puro: sem DOM, `window` nem `localStorage`, testável com `node --test`. Toda a lógica
  vive aqui, e a UI só a consome.
- `js/ui/` são componentes DOM, `js/pages/` tem uma entrada por página.
- A CSP não deixa scripts inline: o que corre no `<head>` vive em `js/boot.js`.
- Dependências novas só com bom motivo e versão fixa. O JS do site não depende de `node_modules`.
- Classes Tailwind escritas por inteiro no código. Movimento só por `js/ui/motion.js`.
- `localStorage` só por `js/ui/storage.js`, com chaves `nd:v1:*` e tudo em try/catch.
- Todas as strings visíveis em `js/ui/locales/{pt,en}.js`. As páginas PT são a fonte e `en/*.html` é
  gerado por `npm run build:pages`. O idioma vem só do URL.
- PT é português de Portugal, a tratar o leitor por tu.
- Créditos como no SAT: «Plataforma criada por Miguel Rocha · miguelrocha.dev» na barra do topo e
  «Desenvolvido por Miguel Rocha · miguelrocha.dev» no rodapé, com link para https://miguelrocha.dev.
- Nome e URL só em `js/ui/config.js`: `APP_NAME = "Learn Natural Deduction"`,
  `SITE_URL = "https://nd.computational-logic.miguelrocha.dev"`.
- O rodapé liga, no idioma da página, ao hub e ao SAT, com `HUB_URL` e `SAT_URL` do `js/ui/config.js`.
- Vercel Web Analytics só no hostname do `SITE_URL`.
- Licença MIT, © 2026 Miguel Rocha.

## Conteúdo

Texto, exemplos e exercícios são originais. `conteudos/` serve só para confirmar regras e
terminologia. Nunca copies frases, exemplos ou enunciados, e não confies nas citações dos slides,
que têm gralhas. Toda a prova publicada no site passa pelo verificador nos testes.

## Rotas

| PT | EN |
| --- | --- |
| `/` | `/en` |
| `/aprender` | `/en/learn` |
| `/provar` | `/en/prove` |
| `/passo-a-passo` | `/en/step-by-step` |
| `/exercicios` | `/en/exercises` |

## Convenções de DN

- Mostra-se **F**; `⊥` é aceite na entrada. Valores de verdade: V/F em PT, T/F em EN.
- Siglas PT: MT, ¬¬I, RA, TE, DM, SH, SD. Siglas EN: MT, ¬¬I, RAA, LEM, DM, HS, DS.
- Citações como nos slides: linhas exteriores acessíveis citam-se sem R; R só repete uma fórmula; a
  ordem das linhas citadas é livre; uma subdedução cita-se como intervalo `2–4`.
- ¬E é só ¬¬φ ⊢ φ. Variáveis: `[A-Za-z][A-Za-z0-9_]*`; sufixo numérico em subscrito.
- Negação `¬ ~ - !`, conjunção `∧ & /\ ^`, disjunção `∨ | \/ v`, implicação `→ -> =>`.

## Comandos

Os ficheiros gerados são commitados, e a Vercel não compila nada. Nunca edites `en/` nem os blocos
`<!-- seo -->` e `<!-- footer -->` à mão.

- Testes: `npm test`, que também corre o Chrome headless (`CHROME_BIN` muda o caminho). Snapshots:
  `UPDATE_SNAPSHOTS=1 npm test`, em `tests/__snapshots__/`.
- CSS: `npm run build:css`. `npm run watch:css` não minifica: corre o build antes do commit.
- Módulos: `node scripts/modulepreload.mjs` depois de mudar imports, antes do `build:pages`.
- Páginas EN e SEO: `npm run build:pages`.
- Vendor: `npm run build:vendor`, só depois de mudar a versão do `motion`.
- Imagens de partilha: `scripts/make-share-images.sh`, se mudar o nome ou o modelo em
  `scripts/share-images/`. Nenhum teste deteta um PNG desatualizado.
- Servidor local: `node scripts/serve.mjs 8765`. Imita a Vercel a partir do `vercel.json` e do
  `.vercelignore`.
- Verificação visual: `scripts/check-page.sh <caminho> [pasta]`. Valida sempre a 390px. Opções:
  `FULL_PAGE=1`, `PDF=1`, `REDUCED_MOTION=1`, `BLOCK_STORAGE=1`, `MEASURE=1`, `CLICK`, `EVAL`, `PORT`.
  As screenshots vão para `tmp/screens/`.
- Todas as páginas: `scripts/check-all.sh [pasta]`, nas 3 condições (normal, movimento reduzido e
  `localStorage` bloqueado).
- Outras verificações no Chrome: `scripts/check-step.sh`, `scripts/check-exercises.sh`,
  `scripts/check-edge.sh` e `scripts/check-keyboard.sh`. Os `scripts/check-*.mjs` correm no `npm test`.
- Lighthouse: `scripts/lighthouse.sh [pasta]`. Usa a rede e falha abaixo de `MIN=95`.
- Deploy: `scripts/smoke-deploy.sh [url-base]`, com `curl`; sem URL, corre contra o `serve.mjs`.
- Documentação: o `tests/docs.test.js` exige que existam os scripts, os comandos, as rotas e os tokens
  citados aqui, no `README.md` e no `DESIGN.md`.
