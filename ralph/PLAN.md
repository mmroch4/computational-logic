# Plano de construção

Cada `### [ ]` é uma tarefa, feita por uma sessão nova. O `ralph/run.sh` marca-as e para nas `PAUSA`.
Âmbito: site proposicional completo, em PT e EN, testado localmente. Ficam de fora a lógica de
1.ª ordem, a passagem para o monorepo e a publicação.

## Bloco A — Fundação

### [x] A1 · Infraestrutura copiada do SAT
A partir de `.reference/sat/`, cria `package.json` (mesmas versões fixas, nome `natural-deduction`),
`vercel.json`, `.vercelignore`, `LICENSE`, `scripts/serve.mjs`, o build de CSS, o build do vendor e
`js/boot.js`. Instala as dependências. Acrescenta `.reference` ao `.vercelignore` e ajusta a CSP para
permitir Web Workers de `'self'`.
**Feito quando:** `npm run build:css` funciona, `npm test` corre com pelo menos um teste e o servidor
responde em `/`.

### [x] A2 · Camada de UI genérica
Copia e adapta de `.reference/sat/js/ui/` o que não é específico do SAT: `config`, `i18n`, `storage`
(chaves `nd:v1:*`), `motion`, `layout`, `menu`, `message`, `analytics`, e `DESIGN.md`, retirando tudo
o que for SAT. Copia os respetivos testes.
**Feito quando:** não há referências a SAT, DLL ou `dpsat` em `js/` nem em `DESIGN.md`, e os testes
passam.

### [x] A3 · Páginas vazias, rotas e geração EN
Cria as 5 páginas PT e a 404, com barra de créditos, cabeçalho, rodapé e estado vazio. Cria
`js/core/routes.js`, `js/pages/*` e os locales mínimos. Adapta `build-pages.mjs`, `modulepreload.mjs`
e testes de rotas, meta e páginas.
**Feito quando:** as 10 páginas e a 404 abrem localmente, o seletor de idioma funciona e os testes de
build falham se os ficheiros gerados estiverem desatualizados.

### [x] A4 · Verificações de browser
Adapta `check-page.sh`, `check-all.sh`, `check-keyboard.sh`, `check-edge.sh`, `lighthouse.sh`,
`smoke-deploy.sh`, `a11y-audit.mjs` e `motion-audit.mjs` às novas rotas.
**Feito quando:** `scripts/check-all.sh` passa em todas as páginas.

## Bloco B — Núcleo lógico

### [x] B1 · Fórmulas e parser
`js/core/formula.js` e `parser.js`: AST imutável com ∧, ∨, ¬, →, F e átomos, igualdade estrutural e
impressão com o mínimo de parênteses (¬ > ∧ > ∨ > →, → associa à direita). O AST deve poder receber
termos, ∀ e ∃ mais tarde. Erros com posição e código traduzível. Todas as notações do `CLAUDE.md`.
**Feito quando:** imprimir e voltar a ler dá a mesma fórmula, em teste com fórmulas aleatórias.

### [x] B2 · Sequentes, esquemas e substituição
`js/core/sequent.js` para `p ∧ q, r ⊢ q ∧ r` e `⊢ φ`. `js/core/schema.js`: esquemas com metavariáveis,
correspondência de um esquema com uma fórmula e aplicação de substituições.
**Feito quando:** há testes de sucesso, de conflito de metavariáveis e de falha.

### [x] B3 · Semântica
`js/core/semantics.js`: avaliação, tabela de verdade, tautologia, sequente válido e contraexemplo
mínimo com a valoração.
**Feito quando:** há testes com sequentes válidos, inválidos e com premissas inconsistentes.

### [x] B4 · Modelo de prova
`js/core/proof.js`: linhas, subdeduções e escopos. Calcula que linhas e intervalos estão acessíveis a
partir de cada linha. Inclui inserir, apagar, abrir e fechar subdedução, com renumeração.
**Feito quando:** há testes para escopos aninhados, subdeduções fechadas e renumeração.

### [x] B5 · Regras base e verificação de uma linha
`js/core/rules.js` com o catálogo declarativo das regras base e `js/core/verify.js`. Erros com códigos
distintos: regra inaplicável, linha inacessível, subdedução ainda aberta, citação em falta, fórmula
não corresponde. Cumpre as convenções de citação do `CLAUDE.md`.
**Feito quando:** cada regra tem testes de uso correto e de cada erro relevante.

### [x] B6 · Formato textual e verificação da prova inteira
`js/core/proof-text.js`: lê e escreve provas em texto (`4 | r ∧ q   ∧I, 3, 2`, com indentação por
escopo). `verifyProof` indica se a prova conclui o sequente pedido e se tem premissas extra.
**Feito quando:** há testes com pelo menos 10 provas originais corretas e 10 incorretas.

### [x] B7 · Regras derivadas e conjuntos de regras
Acrescenta MT, ¬¬I, RA, TE, DM (as 4 direções), SH e SD ao catálogo. Cada uma guarda uma prova só com
regras base. Implementa os conjuntos `base`, `completo`, `base + {…}` e `restrito`, e o erro
«regra não permitida».
**Feito quando:** um teste verifica todas as provas guardadas só com regras base, e as siglas seguem
o idioma.

### [x] B8 · Regras do utilizador
`js/core/user-rules.js` conforme o `SPEC.md`: esquema-tipo, validação sintática, solidez por tautologia
com contraexemplo, serialização e nova validação ao carregar. Integra no verificador. Implementa o
campo `userRules` e a marca de prova com regras próprias.
**Feito quando:** há testes com regras sólidas, não sólidas, com subdedução e com link adulterado.

### [x] B9 · Solidez do verificador
`tests/soundness.test.js`: corpo de pelo menos 30 provas originais e mutações automáticas (mudar
regra, citação ou fórmula, mover linhas para fora do escopo). Toda a prova aceite tem de ter um
sequente válido pela tabela de verdade.
**Feito quando:** o teste corre com semente fixa, e cada falso positivo encontrado está corrigido no
verificador.

### [x] PAUSA-1 · Rever o motor
Antes do solver e da interface, vê se o verificador se comporta como esperas: `npm test` e
`js/core/verify.js`. Se quiseres mudar regras ou citações, é agora que sai barato.

## Bloco C — Solver

### [x] C1 · Procura de provas
`js/core/solver.js`: decide a validade pela semântica e procura orientada pelo objetivo (→I, ¬I, ∧I,
∨E, RA, encadeamento para a frente), com limite de passos. Devolve uma prova do formato de B4.
**Feito quando:** encontra prova para 40 sequentes válidos clássicos, todas aceites por `verifyProof`.

### [x] C2 · Conjuntos de regras e casos sem prova
O solver respeita o conjunto ativo. Distingue «sem prova com estas regras» de «limite atingido»,
sem nunca afirmar o primeiro sem o provar. Inclui `¬¬p ⊢ p` sem ¬E, RA e TE.
**Feito quando:** há testes para os dois casos, sem mensagens enganadoras.

### [x] C3 · Provas legíveis
Pós-processamento: remove linhas e subdeduções inúteis e reutiliza subprovas. Cada passo guarda a
estratégia usada (código traduzível). Provas curtas em exemplos simples.
**Feito quando:** um benchmark fixa o comprimento máximo por exemplo, e `¬q → ¬p ⊢ p → ¬¬q` e análogos
ficam com comprimento próximo de uma prova manual.

### [x] C4 · Dicas
`js/core/hints.js`: dado um estado parcial, sugere o próximo passo com 3 níveis: estratégia, regra e
passo exato. Baseia-se nas heurísticas do solver e funciona com provas incompletas.
**Feito quando:** há testes em estados iniciais, a meio e sem saída.

### [x] C5 · Worker e desempenho
`js/ui/solver-worker.js` com tempo limite e cancelamento, sem bloquear a página. `tests/performance`
com orçamentos de tempo.
**Feito quando:** um sequente difícil não bloqueia a UI e o cancelamento é testado.

## Bloco D — Página Provar

### [x] D1 · Entrada de sequentes
Campo de sequente com teclas para símbolos, exemplos, conversão de notação e erros inline.
**Feito quando:** funciona a 390px com teclado virtual e os erros mostram a posição.

### [x] D2 · Vista de Fitch
`js/ui/fitch-view.js`: numeração, barras de escopo, fórmula, regra e citações, com estado de cada
linha. Só leitura, com testes de snapshot.
**Feito quando:** subdeduções com 4 níveis cabem a 390px com scroll próprio.

### [x] D3 · Modo de escrita
Edição linha a linha com verificação imediata, abrir e fechar subdedução, teclas de atalho, desfazer e
erro por linha, numa só frase e sem jargão.
**Feito quando:** uma prova com subdeduções é feita só com o teclado, em teste.

### [x] D4 · Modo guiado
Selecionar linhas, escolher regra e gerar o passo, para a frente e a partir do objetivo. Regras
inaplicáveis ou proibidas ficam desativadas, com motivo.
**Feito quando:** a mesma prova de D3 é feita sem escrever fórmulas, também a 390px.

### [x] D5 · Dicas, solução e contraexemplo
Painéis para os 3 níveis de dica, solução automática com cancelamento, contraexemplo e estados
vazios. A solução pode ser pedida a partir da prova parcial, quando possível.
**Feito quando:** cada estado tem teste e aparece corretamente em PT e EN.

### [x] D6 · Vista em árvore
Conversão de Fitch para árvore de Gentzen e vista só de leitura, com scroll próprio e destaque da
linha correspondente.
**Feito quando:** a conversão é testada em provas com ∨E, →I e RA.

### [x] D7 · Partilha e exportação
Estado no URL, histórico local, exportação para LaTeX e impressão em PDF. Os testes de compilação LaTeX
ficam ignorados se `pdflatex` não existir, porque não está instalado.
**Feito quando:** abrir um link repõe a prova exata e um link inválido dá erro claro.

### [x] D8 · Editor de regras do utilizador
Interface do esquema-tipo, com pré-visualização, resultado da validação, contraexemplo, lista, apagar
e uso nos dois modos. Inclui regras no link partilhado.
**Feito quando:** criar, usar, partilhar e reabrir uma regra funciona de ponta a ponta.

### [x] D9 · Acessibilidade da página Provar
Passa os check de teclado, toque, contraste, movimento reduzido e `localStorage` bloqueado. A prova
deve ser legível por leitor de ecrã, com estado anunciado.
**Feito quando:** `scripts/check-all.sh` e `scripts/check-keyboard.sh` passam.

### [x] PAUSA-2 · Rever o editor
Experimenta `/provar` no computador e no telemóvel: `node scripts/serve.mjs 8765`. Todo o conteúdo
seguinte assenta neste editor, por isso é a altura de pedir alterações de interação.

## Bloco E — Exercícios

### [x] E1 · Motor de exercícios
`js/core/exercises.js`: formato com id, nível, sequente, conjunto de regras, `userRules`, solução e
dicas opcionais. Regista progresso com «resolvido» e «resolvido com regras próprias».
**Feito quando:** um teste valida todos os exercícios contra o verificador com o conjunto de cada um.

### [x] E2 · Exercícios de prova
~50 exercícios originais em níveis, incluindo provar as regras derivadas com `base`.
**Feito quando:** todas as soluções são aceites e nenhum enunciado é copiado de `conteudos/`.

### [x] E3 · Encontra o passo errado
~10 provas originais com um erro, e modo para apontar a linha e explicar o erro por escolha múltipla.
**Feito quando:** o verificador confirma que cada erro está exatamente na linha indicada.

### [x] E4 · Página Exercícios
Lista por níveis, reutilização do editor, regras permitidas visíveis, progresso e repor.
**Feito quando:** `scripts/check-exercises.sh`, adaptado, faz os dois modos até ao fim.

## Bloco F — Passo a passo

### [x] F1 · Player
Reproduz uma prova gerada por eventos com a estratégia de cada passo, usando a timeline e os atalhos do
SAT adaptados. Estado no URL: `?s=…&step=N&view=fitch|tree`.
**Feito quando:** avançar, recuar e abrir um passo por link estão testados.

### [x] F2 · Página Passo a passo
Sequente à escolha, exemplos e explicação por passo. Sequente inválido mostra o contraexemplo.
**Feito quando:** `scripts/check-step.sh`, adaptado, passa em PT e EN.

## Bloco G — Aprender

### [x] G1 · Estrutura da lição
Índice e 9 secções: o que é uma prova, ∧, →, subdeduções e escopo, ∨, ¬ e F, regras derivadas,
estratégias, solidez e completude. Componentes de figura e interação reutilizáveis.
**Feito quando:** a página tem índice e secções navegáveis com link direto.

### [ ] G2 · Secções 1 a 4
Texto PT original e exemplos verificados nos testes.
**Feito quando:** cada regra tem exemplo e erro comum, e não há texto copiado de `conteudos/`.

### [ ] G3 · Secções 5 a 7
Inclui cada derivada com a sua prova, mostrada a partir de B7.
**Feito quando:** as provas vêm do catálogo, sem duplicação.

### [ ] G4 · Secções 8 e 9 e laboratórios
Estratégias com provas animadas, solidez e completude em linguagem acessível, e laboratórios
interativos curtos usando o editor.
**Feito quando:** há pelo menos 3 laboratórios a funcionar a 390px.

### [ ] G5 · Quiz
Quiz final com perguntas originais, explicação por resposta e reutilização do motor do SAT.
**Feito quando:** o quiz vai até ao fim em PT e EN.

## Bloco H — Fecho

### [ ] H1 · Página inicial
Apresentação, prova de exemplo a animar, ligações às 4 páginas.
**Feito quando:** mostra o editor em ação sem imagens pesadas e passa o `check-page.sh`.

### [ ] H2 · Tradução EN completa
Tradução natural de todos os locales e de todo o conteúdo, com siglas EN.
**Feito quando:** um teste garante chaves iguais em PT e EN, sem texto PT nas páginas EN.

### [ ] H3 · SEO e imagens de partilha
Meta, JSON-LD, sitemap, robots, `og-image`, favicon, ícones e manifest.
**Feito quando:** `scripts/make-share-images.sh` gera as imagens e os testes de meta passam.

### [ ] H4 · Auditoria final
`check-all.sh`, `check-keyboard.sh`, `check-edge.sh`, Lighthouse (mínimo 95 e SEO 100) e testes.
Corrige o que falhar.
**Feito quando:** todos passam. Se a rede falhar no Lighthouse, regista isso em `ralph/NOTES.md`.

### [ ] H5 · Documentação
`README.md` em inglês, como o do SAT, e `CLAUDE.md` e `DESIGN.md` atualizados.
**Feito quando:** os comandos documentados funcionam.
