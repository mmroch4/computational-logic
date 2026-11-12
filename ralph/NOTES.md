# Notas do loop da 1.ª ordem

Decisões e armadilhas que afetam tarefas futuras. Uma linha por nota, numa secção por tarefa.

## Herdadas da migração para monorepo

- A suite da dedução natural tem cerca de 1120 testes e demora cerca de 100 s. Os testes do Chrome são
  os mais lentos (até 75 s cada): nunca corras suites em paralelo.
- `scripts/test-all.sh` corre o SAT, a dedução natural e o hub em série. O `scripts/test-test-all.sh` só
  é preciso se alterares o `test-all.sh`.
- Ordem dos builds depois de mudar páginas ou imports: `node scripts/modulepreload.mjs`, depois
  `npm run build:pages`.

## S1

- Siglas das negações de quantificadores: NQ1–NQ4 em PT (id da regra), QN1–QN4 em EN, pela ordem
  ¬∀⊢∃¬, ∃¬⊢¬∀, ¬∃⊢∀¬, ∀¬⊢¬∃ (tabela no `SPEC.md`).
- A dimensão nova fixada no `SPEC.md`: lição de 14 secções, cerca de 90 exercícios (15 de passo errado).
- O teste Chrome de `tests/lesson.test.js:499` deu timeout (90 s) no `npm test` e passou sozinho: carga.

## L1

- `formula.js`: `term(name, args)`, `eq`, `forall(name, φ)`, `exists`; `freeVariables` devolve um `Set`
  (só termos sem argumentos; nomes de função não contam). `substitute` é literal (não renomeia) e
  devolve o mesmo nó se nada mudar: chama `isSubstitutable` antes.
- `RESERVED_TERM_NAMES` = F, forall, exists (o `v` pode ser termo). `RESERVED_NAMES` dos átomos ficou
  F e v: acrescentar `forall`/`exists` aos átomos fica para o parser.
- `format`: espaço depois de `∀x` exceto antes de `(` ou de outro quantificador (`∀x∀y R(x, y)`).
  `¬a = b` lê-se `¬(a = b)`, porque `=` liga mais do que tudo.

## L2

- Parser: `nome(…)` é predicado, ou termo se vier `=` a seguir; aceita espaço antes do `(`. O token do
  quantificador traz a variável (`text` = `∀x`, `name` = `x`). Erros novos: missingVariable,
  missingTerm, notATerm, badArgument, badEquality. Vírgula fora de argumentos continua unexpectedChar.
- Sequentes: só as vírgulas dentro de um `(` logo a seguir a um nome (que não `v`/`F`) deixam de
  separar; `p, (q, r) ⊢ s` dá o mesmo erro de antes.
- `proof-text.js` ainda corta a justificação na 1.ª vírgula da linha: `P(a, b)` numa prova parte-se.
  Fica para quem ler provas de 1.ª ordem (V1/E1).
- `tests/fixtures/propositional-corpus.json` é a base proposicional de antes da L2 (todas as strings de
  `js/` e `tests/` que se liam). Nunca a regeneres: o teste compara a leitura atual com ela.
- O `check-learn.mjs` leva ~75 s sozinho; o limite de 90 s em `tests/lesson.test.js` falhava sob carga
  (parser medido: tão rápido como antes). Passou a 240 s, como o `check-english`. A lição vai crescer.
- `QUANTIFIER_WORDS` é um `Map`: com um objeto, `"constructor" in …` apanhava o protótipo.

## L3

- `isPropositional` (formula.js) e `isPropositionalSequent` (sequent.js). `truthTable`/`checkSequent` devolvem
  o erro `notPropositional` (em `SEMANTICS_ERROR_CODES`); `solve`, `hint` e `completeProof` herdam-no, e o
  `countermodel` devolve null. Quem lia só `.valid` (quiz, find-error) passou a exigir `ok`. Ao ligar o
  solver de 1.ª ordem, troca-se a guarda no `solve`, não na semântica.
- O painel de ajuda tem a vista `firstOrder` (`assist.firstOrder`), já no estado inicial, sem chamar o
  Worker. Regras do utilizador com quantificadores, termos ou `=`: erro `firstOrder`, também ao ler links.

## V1

- A linha de etiqueta não é uma entrada de `lines`: é o campo `label` da hipótese seguinte (que fica a
  `depth` da caixa + 1), para `lines[n - 1]` continuar a ser a linha n. `fresh`/`label` só existem na
  linha quando não são null (lê `line.fresh ?? null`), como o `strategy`: os snapshots não mudam.
- `subproofs()` dá também `fresh` e `label` (caixa da etiqueta). A caixa da etiqueta e a da hipótese
  começam na mesma linha `from`, a da etiqueta primeiro: procura uma caixa por `from` e `label`.
- `editLine` só muda o nome da variável (ou o `fresh` de uma hipótese); abrir ou fechar a caixa do ∀I
  num passo, ou a linha de etiqueta, é `invalidLine`. Apagar a linha que abre uma caixa apaga-a toda.
- Texto: a marca `[v]` fica a 2·depth espaços da barra (indentação par), a fórmula a seguir; os
  números sem marca seguem 1 + 2·depth. As linhas de dentro do exemplo 1 do `SPEC.md` (6 espaços,
  alinhadas com a fórmula da marca) não se leem: usa 3. Erros novos: `badFresh`, `orphanLabel`. A
  justificação separa-se na 1.ª vírgula fora de parênteses: `R(a, b)   ∀E, 1` já se lê.
- Links: só uma prova com `fresh`/`label` usa `p=2` (`[depth, fórmula, justificação|null, fresh, label]`);
  as outras continuam `p=1`, byte a byte, e o `check-share.mjs` e a acessibilidade esperam `p=1`.
