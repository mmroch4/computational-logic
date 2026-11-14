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

## V2

- Esquemas: `t`, `t1`, `t2` são `metaTerm`; `x`, `y`, `v` são `metaVariable` (ficam com um termo sem
  argumentos); um quantificador do esquema com esse nome liga-o (`∀x φ` dá x ↦ term("y")). `φ[t/x]` é o
  nó `subst` (args [φ, t, x]). Só o parser de esquemas os lê; fora deles, `t`/`x` são termos e `[` é erro.
- `φ[t/x]` por resolver fica na chave `PENDING` ("pending") da substituição, que só existe se houver
  algo adiado. Resolve-se com φ e x ligados, ou com dois `φ[t1/x]`/`φ[t2/x]` e t1, t2 ligados (=E).
  O verificador deve ligar o `v` da etiqueta antes de casar a caixa (`{ ...subst, v: term(label) }`).
- Captura: `matchSchema` e `applySubstitution` dão o erro `capture`; o `notFree` (v a escapar) não é da
  casação, avalia-se com `checkCondition` (null para `fresh` e para metavariáveis por ligar).
- A casação compara com `equals`, não com `alphaEquals`: este não tem o atalho `a === b` e fica
  exponencial nas fórmulas com subárvores partilhadas (o teste da prova que duplica, em `tree.test.js`,
  pendurou a suite). Se a V3 quiser α nas metavariáveis, faz `equals(a, b) || alphaEquals(a, b)`.
- Regras: `conditions` (sempre, vazio nas proposicionais) e `fresh` nas subdeduções (null por omissão);
  a caixa do ∀I tem `hypothesis` null. `FIRST_ORDER_RULES` está no `rules.js` mas fora de `BASE_RULES`
  e `RULES`: a V3 junta-as e tem de adaptar `guided` (`fillPremise`, `metasOf` vê o φ do `φ[t/x]`) e
  `rule-pick` (`premiseOf` com hipótese null). `user-rules.test.js` passou a esperar a chave `conditions`.

## V3

- `BASE_RULES` = `PROPOSITIONAL_RULES` + `FIRST_ORDER_RULES`. `isFirstOrderRule` (rules.js): o solver
  (`extraRulesOf`), o `countermodel` e o `respects` põem-nas de parte (num sequente proposicional não
  provam nada novo: domínio de 1 elemento). O corpo de `soundness.test.js` e a lição (secções 2–6) usam
  só as proposicionais até à V4/lição de 1.ª ordem.
- Caixas: `rangeBox(lines, range)` dá "forall" (passo com `fresh` ou etiqueta), "exists" (hipótese com
  `fresh`) ou "plain"; tem de bater com a premissa (`missingFreshBox`/`wrongBox`). O `bindPremise` liga o
  v antes de casar. `citationProblem` passou a escolher a caixa por `from` e `to` (a da etiqueta e a da
  hipótese começam na mesma linha; antes, o `→I, 1–1` dentro de uma etiqueta dava `openSubproof`).
- Erros novos: `notFresh` {variable, cited}, `variableEscapes` (∀I e ∃E), `notSubstitutable` {variable,
  term} (vem do `capture` do `matchSchema` ou da condição). Ganham ao `formulaMismatch`.
- α: `sameFormula` (schema.js) = `equals` ou, com quantificadores (em cache), `alphaEquals`. Serve no
  `bind` das metavariáveis, na conclusão e nas premissas extra. Uma conclusão com `PENDING` por resolver
  não conta como derivada.
- Modo guiado: uma caixa [v] por citar não se gera (`planPremises` devolve null); fica para a E2.
  `premiseText` (guided.js, exportado) escreve `[v] … φ[v/x]` e `[v] φ[v/x] … ψ`.

## V4

- NQ1–NQ4 estão em `DERIVED_RULES` (são `isFirstOrderRule`); o `ruleGoal` delas põe P(x) no lugar de φ.
  Siglas EN QN1–QN4 em `rules.labels` e `RULE_ALIASES`. A lição (secção 7) e os exercícios de regra
  filtram-nas com `PROPOSITIONAL_DERIVED` em `lesson.test.js` e `exercises.test.js`: a C2 e a C3 tiram o filtro.
- Verificador: se a conclusão não casa com o esquema, compara-se a instância com `sameFormula` (o `x`
  ligado pela premissa de NQ1 aceita `∃z ¬P(z)`).
- `tests/helpers/finite-models.js`: contramodelos por força bruta (domínio 1–3, orçamento 4096
  estruturas), só para testes. Não é o M1: o M1 faz o do núcleo, com orçamento e para a UI.
- Solidez: `openHypotheses` ignora as caixas do ∀I (passo ou etiqueta). Uma só mutação nunca dá um falso
  positivo com um ∀I sem «v nova» (a variável tem de bater com a fórmula): o teste conta antes os
  códigos `notFresh`/`variableEscapes`/`wrongBox` nos mutantes recusados.
- Árvore: nó de inferência ganha `variable` só com caixa [v]; a caixa do ∀I não descarrega nada. LaTeX:
  marca `\boxed{v}\ ` antes da fórmula, linha de etiqueta como linha sem número; `P(x)` sem espaço.
  Não há `pdflatex` nesta máquina: o teste de compilação salta-se.

## E1

- Escrita: o campo da fórmula aceita `[v]` à frente (`readFormulaField`, `formulaText` em editor.js). Num
  passo, escrever a marca leva a linha para uma caixa do ∀I um nível mais dentro (`createProof` com a
  linha mudada, sem mexer nas citações); apagá-la desfá-la só se a caixa tiver uma linha, senão fica com
  `editor.errors.freshBoxNotEmpty`. Texto que não se lê nunca muda a caixa. Ctrl+Enter numa linha só com
  `[v]` dá a linha de etiqueta + hipótese. O nome da etiqueta não se edita: apaga-se a caixa.
- O `formulaError` pode trazer `key` (frase fora de `parser.errors`); o `writingMessage` usa-a.
- Vista: `labelRowHtml` (li sem `data-line`, por isso `[data-line]` continua a ser só linhas numeradas),
  `lineFreshHtml`, `opensBox`. A marca fica inline entre a barra e a fórmula; as linhas de dentro não
  alinham com a fórmula da marca, como no texto.
- Teclas ∀, ∃, = em `SYMBOL_KEYS` (o «atalho» é escrever `forall`/`exists`, dito no nome lido);
  `FIRST_ORDER_KEYS` ficam fora das regras do utilizador. Grelha das teclas a 6 colunas e ⊢ sem span 2.
- Fixtures `BOXES`/`LABEL` em `tests/fixtures/fitch-proofs.js`, usadas no check-fitch e no check-share (p=2).

## E2

- Guiado: `completions` (guided.js) liga o que falta: só o `t` (∀E, ∃I, =I) entre os termos da prova e o
  `v` das caixas são pedidos (`outcome.ask`, mudado com `reviseOutcome`); o ∃I/=E dão uma escolha por
  subconjunto de ocorrências (`GUIDED_LIMITS.occurrences`). `possibleConclusions` serve o rule-pick, que
  junta `null` («outro termo») quando há termo à escolha.
- Caixa do ∀I num passo pendente: o que entra antes dele passa a abrir a caixa (`insertAtBoxStart`, em
  proof.js; numa hipótese vira linha de etiqueta). Um ∀I dentro dela abriria na mesma linha: o guiado dá
  `boxClash`; as dicas repetem um facto por R (`separateBoxes`). Rever na PAUSA-3.
- Dicas de 1.ª ordem: `firstOrderHint` (hints.js), heurísticas sem solver nem tabela; sem passo dá
  `unknown`/`searchExhausted`. O painel de ajuda continua com a vista `firstOrder` (não chama o Worker)
  até à M2/M3, que ligam dicas, solução e contramodelo juntos. Estratégias novas em `STRATEGY_CODES`.
- O `tests/helpers/corpus.js` lê as strings por regex: um template com `${…}` acrescentado a um teste
  troca a paridade das crases e «apaga» textos do corpus. Nos testes novos, concatena.
- Nos scripts do Chrome, esperar ~600 ms depois de aplicar um passo: o foco vai para o objetivo com
  scroll suave e o toque seguinte cai noutro botão.

## M1

- `js/core/structures.js`: `evaluateIn`, `isCountermodel`, `findCountermodel` e `firstOrderVerdict`. Estrutura
  legível: `{ size, constants: [{name, value}], functions: [{name, arity, table: [{args, value}]}],
  predicates: [{name, arity, extension: [tuplos]}] }`; átomo 0-ário verdadeiro se a extensão tiver `[]`.
- `COUNTERMODEL_LIMITS` = domínio até 4, 2 000 000 passos (um por estrutura e um por elemento percorrido
  num quantificador, para o tempo não crescer com o encaixe). Esgotar mede ~150 ms.
- `firstOrderVerdict(goal, { prove })` procura primeiro o contramodelo (orçamento fixo) e só depois
  chama o `prove` (a M3 liga o solver); sem nenhum dos dois, "unknown".
- Casas das variáveis ligadas por profundidade, não por `scope.size`: com `∃x∃x∃y`, o tamanho do âmbito
  não cresce e o y pisava o x.
- Corpus: o template com `${…}` em `budgets.test.js:29` deixa uma crase ímpar; uma crase num comentário
  mais abaixo engolia o TEXTBOOK. Nada de crases nesse ficheiro.

## M2

- `solve` de 1.ª ordem: `solveFirstOrder` (solver.js) dá `{ ok, valid: false, structure }` ou o erro
  `undecided` {maxSize}; a M3 liga ali a procura de provas. `completeProof` passa a `structure`; `hint`
  procura o contramodelo antes de `firstOrderHint` (cada dica custa até ~200 ms no pior caso).
- Saíram `FIRST_ORDER`, `assistSupports`, `idlePanel` e `assist.firstOrder`: o painel chama sempre o Worker.
  O painel `invalid` tem `structure` ou `valuation`; `counterexampleHtml` (counterexample.js) escolhe.
- Elementos mostram-se de 1 a n (na estrutura vão de 0 a n − 1); extensão vazia é `∅`; 0-ário é V/F.
- Sequente que esgota o orçamento (só modelos infinitos, nunca terá prova): `∀x ¬R(x, x),
  ∀x∀y∀z(R(x, y) ∧ R(y, z) → R(x, z)), ∀x∃y R(x, y), S(a, b) ⊢ F`. Sem o `S(a, b)` só esgota o domínio.
- check-page do Provar: `CLICK='[data-assist="solve"]'` chega (o resultado sai antes da screenshot). Um
  `FULL_PAGE=1 CLICK=… EVAL=…` com três variáveis pediu aprovação; com duas passou.

## M3

- Procura de 1.ª ordem em `js/core/first-order-search.js` (`searchFirstOrder`), que é o `prove` do
  `firstOrderVerdict` no `solve`: aprofundamento iterativo, sem tabela de verdade, só regras base ativas.
  O caminho proposicional não lhe toca (snapshots iguais). O fim do `attempt` passou a `verifiedProof`.
- `derivation.js`: `subderivation(…, fresh)`; `boxVariable(v)` faz de hipótese do ∀I; `uses` num nó
  (caixas das variáveis da fórmula) conta nas dependências, para o `tidy`/`share` nunca tirarem uma
  linha com v da caixa. 1.ª linha da caixa: `[v]` + `openForallBox` num passo, `label` numa hipótese;
  caixa do ∀I logo a abrir outra: R do último facto acessível (ou =I) com `separateBoxes`.
- Variáveis novas: u, v, w, s, r, fora do sequente e das caixas abertas (caixas irmãs repetem o nome).
  Sem termos no sequente, o ∀E/∃I usa a constante `a`. Lista fixa em `tests/fixtures/first-order-sequents.js`.
- Cada válido custa ~150 ms, quase tudo no contramodelo que esgota antes da prova; `undecided` com os
  MAX_STEPS gastos mede ~900 ms. As dicas de 1.ª ordem continuam as heurísticas da E2.
- check-page com sequente: URL entre aspas duplas e com `(`, `)`, `|`, `>` codificados (`%28`, `%29`,
  `%7C`, `%3E`); com `(` cru ou `FULL_PAGE=1` junto, a chamada pediu aprovação.

## M4

- Passo a passo: `stepNotes(proof, event)` (proof-trace.js) dá `{ key, params }` de `player.firstOrder.*` (caixa do
  ∀I/∃E, linha de etiqueta, termo do ∀E/∃I, caixa a fechar); o cartão põe-nas em `p.step-card__why[data-note]`,
  depois da estratégia. Os `solver.strategies.*` ficam sem parâmetros, porque as dicas os usam com `{}`.
- Menu de exemplos: grupo `firstOrder` (só válidos) e `someToAll` no `invalid`, que mostra contramodelo
  (`structure`). A demo da página inicial continua proposicional. O `latex.test.js` aceita `forall`, `exists`, `boxed`.

## C1

- Secções 10–12: `linguagem` (language), `universal` (forall), `existencial` (exists). A C2 junta as suas
  depois destas, sobe o `learn.eyebrow` (o teste exige o número) e acrescenta =I/=E à lista do teste das regras.
- `ruleSchemaLines` usa o `premiseText` do guided.js (caixas [v]). Cada regra de `LESSON_RULES` tem um erro.
- `LAB_GUIDED`: `ask: true` nos passos em que o guiado propõe termo ou variável; o teste exige que bata com
  `outcome.ask`, e o `check-learn.mjs` toca em `[data-choice="0"]`. Contagens do check-learn vêm do `lesson.js`.

## C2

- Secções 13–14: `igualdade` (equality), `equivalencias` (equivalences); NQ1–NQ4 em `LESSON_DERIVED` como
  notForall, existsNot, notExists, forallNot. O filtro `PROPOSITIONAL_DERIVED` saiu do `lesson.test.js`; o dos
  exercícios fica para a C3.
- Quiz com 12 perguntas: as 4 de 1.ª ordem vão no fim (forallLine, escapedName, equalityLine,
  quantifierNegation). O check-learn tira o total do `quizQuestions()` e as formas do `lessonDerivedForms`.
- Cada `.fitch` tem tabindex="0": uma prova de uma só linha fica com menos de 44px e o a11y do check-page
  falha (só se vê depois de as figuras montarem: `EVAL` com espera de ~4 s). Há um teste que o impede.

## C3

- 28 exercícios de 1.ª ordem nos níveis 6–9 (instanciar, caixas, NQ, igualdade/encaixados), depois dos
  52 proposicionais, que ficam à frente e iguais (há um teste). Ids de NQ: `ex-prove-nq1`…`nq4`. O filtro
  `PROPOSITIONAL_DERIVED` saiu dos exercícios. O solver resolve os 28 (`SOLVER_UNSOLVED` vazio).
- `tests/helpers/fingerprint.js` trata a 1.ª ordem (predicados, funções e termos livres renomeados; ligadas
  pela profundidade; lados de = ordenados). `course-sequents.js` tem os sequentes de 1.ª ordem do LPLPO-2,
  exceto o Ex. 2.13 (simetria/transitividade de =): a pergunta `equalityLine` do quiz da C2 coincide com
  ele. Rever na pausa se o quiz deve mudar.
- Os enunciados de 1.ª ordem usam predicados com uma maiúscula e átomos 0-ários com uma minúscula sem v.

## C4

- 5 desafios de 1.ª ordem no fim do catálogo (níveis 6, 7 e 9), com 5 explicações novas em `REASONS`
  (duas com `variableEscapes`: ∀I e ∃E). O `notFresh` da caixa repetida aponta o ∃E que a fecha, não a
  hipótese. Sem solução, um sequente de 1.ª ordem precisa de contramodelo do `findCountermodel`.

## P1

- Descrições SEO entre 120 e 160 caracteres (`meta.test.js`). O eyebrow da imagem de partilha perdeu «Notação de
  Fitch»: com «e de 1.ª ordem» partia em duas linhas. Verifica o PNG depois de mudar o modelo.
