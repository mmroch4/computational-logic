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
