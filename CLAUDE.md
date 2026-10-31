# Learn Natural Deduction

Site público para aprender provas no sistema DN em notação de Fitch. A especificação é o `SPEC.md`.
Em caso de conflito, a ordem é: `SPEC.md`, depois este ficheiro, depois `.reference/sat/`.

## Restrições

- HTML estático + ES modules nativos, sem framework JS. CSS com Tailwind v4 + Basecoat.
- `.reference/sat/` é uma cópia só de leitura da ferramenta SAT. Usa-a como referência de convenções e
  copia dela o que precisares. Nunca a edites nem importes dela em runtime. Não está no git.
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

- Testes: `npm test`. Snapshots: `UPDATE_SNAPSHOTS=1 npm test`.
- CSS: `npm run build:css`. Páginas EN e SEO: `npm run build:pages`.
- Módulos: `node scripts/modulepreload.mjs` depois de mudar imports.
- Servidor local: `node scripts/serve.mjs 8765`.
- Verificação visual: `scripts/check-page.sh <caminho> [pasta]`. Valida sempre a 390px.
