# Plano da 1.ª ordem na dedução natural

Cada `### [ ]` é uma tarefa, feita por uma sessão nova do Claude. O `ralph/run.sh` marca-as e para nas
`PAUSA`. O desenho e os motivos estão em `ralph/FOL-PLAN.md`. Tudo vive no ramo `primeira-ordem`.
Salvo indicação em contrário, cada tarefa só altera `natural-deduction/`.

Em todas as tarefas, o comportamento proposicional não muda: os testes e snapshots existentes passam
sem os reescrever. Uma tarefa que precise de mudar um snapshot explica porquê no `ralph/NOTES.md`.

## Bloco S — Especificação

### [x] S1 · SPEC da 1.ª ordem
Escreve no `SPEC.md` a secção da 1.ª ordem a partir do `ralph/FOL-PLAN.md`: linguagem, regras,
condições, caixas, semântica e solver com o resultado «não encontrei», conteúdo e dimensão nova.
Corrige a frase das regras do utilizador em 1.ª ordem. Fixa as siglas PT e EN das quatro derivadas de
negação de quantificadores. Atualiza as «Convenções de DN» do `CLAUDE.md` da dedução natural: notação
de entrada, `forall`/`exists`, `v` em posição de termo e a marca `[v]`. Sem código.
**Feito quando:** o `SPEC.md` cobre todas as secções do `FOL-PLAN.md` e o `tests/docs.test.js` passa.

### [x] PAUSA-1 · Rever a especificação
Lês o diff do `SPEC.md` e do `CLAUDE.md`. Confirmas os nomes sem tipo, a α-equivalência, as regras do
utilizador proposicionais e as siglas novas. O que mudares no `SPEC.md` passa a mandar.

## Bloco L — Linguagem

### [x] L1 · AST de 1.ª ordem
Em `js/core/formula.js`:
- os nós de termo, átomo com argumentos, `eq`, `forall` e `exists`;
- construtores e `format` com a precedência nova;
- variáveis livres, `substitute(φ, x, t)` sem tocar nas ligadas;
- `isSubstitutable(φ, x, t)` e `alphaEquals`.

O `equals` estrutural mantém-se. Só o core, sem parser.
**Feito quando:** há testes para cada função, incluindo captura (`∀y P(x, y)` com t = `f(y)`) e
quantificadores encaixados com o mesmo nome, e o `npm test` passa.

### [x] L2 · Parser, notação e sequentes
Estende o `parser.js` com termos, predicados, `=`, `∀`/`∃`/`forall`/`exists`, a variável de
quantificador de uma letra mais dígitos e o `v` em posição de termo. Junta códigos de erro com mensagens
PT/EN. Atualiza o `notation.js` (conversão símbolos ↔ ASCII) e o `sequent.js` (vírgulas dentro de
`P(a, b)` não separam premissas).
**Feito quando:**
- um teste de regressão lê e imprime todos os sequentes, provas e esquemas que já existem (exercícios,
  exemplos, lição, derivadas, regras guardadas nos testes) e confirma que não mudaram;
- há testes para cada caso novo e cada erro novo, `print → parse` é identidade em fórmulas geradas;
- o `npm test` passa.

### [x] L3 · Fronteira proposicional
Junta `isPropositional(formula)`. Todos os consumidores que hoje assumem lógica proposicional
(`semantics`, `solver`, `countermodel`, `user-rules`, `hints`, `home-demo`, `quiz`, as páginas que os
chamam) passam a tratar um sequente de 1.ª ordem com um resultado explícito («ainda não suportado»,
com mensagem PT/EN), sem lançar exceções. As regras do utilizador recusam esquemas com quantificadores,
termos ou `=`, como diz o `SPEC.md`.
**Feito quando:** escrever um sequente de 1.ª ordem no Provar não dá erro na consola, mostra a mensagem
e permite escrever a prova à mão. Há testes no core e o `scripts/check-page.sh` do Provar com um link de
1.ª ordem passa. O `npm test` passa.

## Bloco V — Verificador

### [x] V1 · Caixas com variável
No `proof.js`:
- o campo `fresh`;
- o `scan()` abre uma subdedução numa hipótese ou num passo com `fresh`;
- a linha de etiqueta (`[v]` sozinho, sem número nem fórmula) quando o ∀I começa por uma hipótese;
- a estrutura válida, `insertLine`, `editLine`, `deleteLine`, `openSubproof` (com variável) e
  `closeSubproof`;
- `accessibleFrom` sem mudanças de semântica.

No `proof-text.js`, a marca `[v]`. No `share.js`, o formato `p=2` com `fresh`, a continuar a ler `p=1`.
**Feito quando:** há testes de estrutura, renumeração, texto e links, e os links `p=1` dos testes antigos
abrem igual. O `npm test` passa.

### [x] V2 · Esquemas de 1.ª ordem
No `schema.js` entram:
- as metavariáveis de variável ligada e de termo;
- o nó `φ[t/x]`, como restrição adiada em `matchSchema` e resolvida percorrendo as duas fórmulas;
- `applySubstitution` com substituição sem captura;
- as condições declarativas.

No `rules.js`, a forma de declarar regras com condições e caixas com variável, legível pelo `guided`,
pelo `rule-pick` e pela lição.
**Feito quando:** há testes de casação para ∀E, ∃I (as várias conclusões possíveis) e =E (ocorrências
parciais), mais casos que falham por captura. O `npm test` passa.

### [x] V3 · Regras ∀, ∃ e =
Junta ∀I, ∀E, ∃I, ∃E, =I e =E a `BASE_RULES`, e as condições ao `verify.js`: v nova, v fora de ψ,
substituível, e caixa com variável onde a regra a pede. A comparação com o sequente passa a usar
α-equivalência. Junta códigos de erro com mensagens PT/EN. Atualiza o `ruleSet`, porque o `base`
passa a incluir as regras novas.
**Feito quando:**
- as provas corretas da Fig. 2.1 e das soluções dos slides, reescritas com conteúdo original, passam;
- cada tentativa errada dá o erro certo: variável que escapa da caixa, v nas premissas, v livre em
  ∀x φ no ∀I, v em ψ no ∃E,
  captura no ∀E, ∀I sem caixa, ∃E sem citar o ∃;
- o `npm test` passa.

### [x] V4 · Derivadas e solidez
Junta as quatro derivadas de negação de quantificadores, com prova só com regras base verificada nos
testes. Estende o teste de solidez do verificador (`tests/soundness.test.js`) à 1.ª ordem: nenhuma prova
aceite tem um contramodelo finito pequeno, com geração de provas mutadas. Atualiza a árvore de Gentzen
(`tree.js`) e o LaTeX (`latex.js`) para as caixas com variável.
**Feito quando:** os testes de solidez cobrem as seis regras novas e as derivadas, o LaTeX compila, se
houver `pdflatex`, e o `npm test` passa.

### [x] PAUSA-2 · Rever o motor
Revês o `js/core/` e experimentas provas à mão com `node`. Confirmas as mensagens de erro em PT.

## Bloco E — Editor

### [ ] E1 · Entrada e vista de Fitch
No Provar:
- botões e atalhos para ∀, ∃ e =, na entrada do sequente e no editor;
- o interruptor de notação com `forall`/`exists`;
- a etiqueta da variável à margem da caixa no `fitch-view`;
- o modo de escrita com `[v]`;
- a vista em árvore e a exportação LaTeX/PDF.

Tudo com strings nos locales PT/EN e acessível por teclado e leitor de ecrã.
**Feito quando:** os `scripts/check-*.mjs` relevantes e o `scripts/check-page.sh /provar` passam a
390px e a 1280px, com uma prova de 1.ª ordem aberta, e o `npm test` passa.

### [ ] E2 · Modo guiado e dicas
- No modo guiado, o ∀E, o ∃I e o =E pedem o termo ou escolhem entre as conclusões possíveis.
- O ∀I e o ∃E sugerem uma variável nova e deixam mudá-la.
- As dicas ganham as estratégias de 1.ª ordem: objetivo ∀ → abrir caixa; premissa ∃ → ∃E; instanciar
  com os termos existentes.

**Feito quando:** há testes no core (`guided`, `rule-pick`, `hints`), e os `scripts/check-guided.mjs`,
`check-rule-pick.mjs` e `scripts/check-keyboard.sh` passam com uma prova de 1.ª ordem. O `npm test` passa.

### [ ] PAUSA-3 · Rever o editor
Abres o Provar localmente (`node scripts/serve.mjs 8765`), em telemóvel e desktop, e fazes provas de
1.ª ordem nos dois modos.

## Bloco M — Semântica e solver

### [ ] M1 · Contramodelos finitos
Novo módulo do core:
- avaliação numa estrutura finita;
- procura de contramodelos com domínio de 1 a N e orçamento;
- o resultado de três estados para sequentes de 1.ª ordem.

Fixa N e o orçamento pelos testes de desempenho (`tests/performance/`).
**Feito quando:**
- todo o contramodelo devolvido falha o sequente quando reavaliado;
- os sequentes inválidos clássicos (∃x P(x) ⊢ ∀x P(x), ∀x∃y R(x, y) ⊢ ∃y∀x R(x, y)) dão contramodelo
  dentro do orçamento;
- o `npm test` passa.

### [ ] M2 · Vista do contramodelo
No Provar e no Passo a passo:
- a estrutura (domínio, constantes, funções e extensões) em vez da valoração, em PT e EN;
- a mensagem «não encontrei prova nem contramodelo»;
- o worker com o mesmo contrato.

**Feito quando:** o `scripts/check-page.sh` passa com um sequente inválido de 1.ª ordem, e com um que
esgota o orçamento, nas duas páginas e a 390px. O `npm test` passa.

### [ ] M3 · Solver de 1.ª ordem
Estende o `solver.js` e o `derivation.js` com a procura de `FOL-PLAN.md`. O caminho proposicional fica
igual. As provas saem verificadas e legíveis, com estratégias novas em `solver.strategies.*`.
**Feito quando:**
- uma lista fixa de pelo menos 20 sequentes válidos de 1.ª ordem, escrita nesta tarefa e com o nível dos
  slides, resolve-se dentro de `MAX_STEPS` e dos orçamentos do worker;
- nenhum sequente inválido dá prova;
- os testes de desempenho e o `npm test` passam.

### [ ] M4 · Passo a passo e exemplos
- O Passo a passo explica os passos de 1.ª ordem: caixa, variável nova, instanciação.
- O menu de exemplos ganha sequentes de 1.ª ordem.
- A demo da página inicial continua proposicional, salvo se o `SPEC.md` disser o contrário.

**Feito quando:** o `scripts/check-step.sh` passa com um exemplo de 1.ª ordem nas duas línguas e o
`npm test` passa.

### [ ] PAUSA-4 · Rever o solver
Experimentas sequentes teus no Provar e no Passo a passo. Confirmas os limites e as mensagens.

## Bloco C — Conteúdo

### [ ] C1 · Lição: linguagem, ∀ e ∃
Secções novas no fim de Aprender: linguagem (termos, predicados, livre e ligada, substituição), ∀ e ∃,
com figuras das regras, provas verificadas e laboratórios, no formato das secções atuais. Texto original
em PT e EN.
**Feito quando:** os testes da lição (`lesson`, `pages`, `english`) e o `scripts/check-page.sh /aprender`
passam. Toda a prova da lição passa no verificador.

### [ ] C2 · Lição: igualdade, equivalências e quiz
Secções de igualdade e de equivalências e estratégias (as derivadas novas, com a prova). Perguntas de
1.ª ordem no quiz. O índice da lição e os hashes das secções existentes não mudam.
**Feito quando:** os testes da lição e do quiz, e o `scripts/check-page.sh /aprender`, passam.

### [ ] C3 · Exercícios de prova
Cerca de 25 exercícios novos em níveis novos, com ids `ex-…` estáveis, conjunto de regras, solução
guardada e dicas PT/EN. Os ids existentes não mudam, nem o progresso guardado.
**Feito quando:** o `validateExercises` não dá problemas, todas as soluções passam no verificador com o
seu conjunto, o solver resolve-as todas ou o teste regista as que não resolve, e o
`scripts/check-exercises.sh` passa.

### [ ] C4 · Encontra o passo errado
Cerca de 5 desafios de 1.ª ordem no catálogo (`find-error-catalog.js`), cada um com um erro típico:
variável que escapa, v não nova, captura, ∃E com v na conclusão, =E mal aplicado.
**Feito quando:** o verificador assinala exatamente a linha errada de cada desafio, e os testes e o
`scripts/check-exercises.sh` passam.

## Bloco P — Publicação

### [ ] P1 · Documentação e SEO
- `README.md` (não só proposicional, regras e notação novas), `DESIGN.md` se houver componentes novos,
  e `CLAUDE.md`.
- Descrições SEO e `build:pages`. Imagens de partilha, se o texto delas mudar.

**Feito quando:** o `tests/docs.test.js`, o `scripts/check-all.sh` e o `scripts/smoke-deploy.sh` local
passam.

### [ ] P2 · Hub
Atualiza o texto da dedução natural no `hub/` para mencionar a 1.ª ordem, em PT e EN. Só altera `hub/`,
num commit próprio.
**Feito quando:** os testes do hub passam e a página valida a 390px.

### [ ] PAUSA-5 · Revisão final
Revês `git log main..primeira-ordem` e o preview da Vercel. Antes de juntar ao `main`, apaga `ralph/`
num commit próprio (`git rm -r ralph`), como na migração, e corre `scripts/test-all.sh`.
