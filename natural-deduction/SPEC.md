# Ferramenta de dedução natural: especificação

Site público, gratuito e estático para aprender a fazer provas no sistema DN, em notação de Fitch.
Segue a base técnica do `davis-putnam-sat`: HTML estático, ES modules, `js/core/` puro, i18n PT/EN.

## Âmbito

- Lançamento: lógica proposicional, com ∧, ∨, ¬, →, F.
- Segunda fase: lógica de 1.ª ordem (∀, ∃, igualdade), descrita na secção «Lógica de 1.ª ordem». O
  motor representa fórmulas e regras de forma a não ter de ser reescrito.
- Conteúdo original. Os PDFs de `conteudos/` servem de referência para regras e terminologia, sem
  copiar texto nem exercícios.

## Páginas

| Página | O que faz |
| --- | --- |
| Provar | Editor livre: sequente, prova com verificação, dicas, solução automática, contraexemplo, LaTeX, link partilhável, regras do utilizador. |
| Aprender | Lição interativa: regras, subdeduções, estratégias, derivadas com a respetiva prova, quiz. |
| Exercícios | Provas graduadas com progresso guardado e o modo «encontra o passo errado». |
| Passo a passo | Reproduz uma prova gerada e explica a estratégia de cada passo. |

## Editor

- Fitch é a notação de edição, em dois modos: escrever linha a linha, ou selecionar linhas e uma
  regra e deixar a ferramenta gerar o passo.
- Cada linha é verificada: regra aplicável, linhas citadas acessíveis, subdedução fechada.
- Árvore de Gentzen como vista só de leitura.

## Regras

### Catálogo

- Base: ∧I, ∧E, ∨I, ∨E, ¬I, ¬E (só ¬¬φ ⊢ φ), FI, FE, →I, →E, R.
- Derivadas: MT, ¬¬I, RA, TE, De Morgan, silogismo hipotético, silogismo disjuntivo.
- Cada derivada guarda uma prova só com regras base, verificada nos testes e mostrada na lição.

### Conjuntos de regras

- Definidos pelo autor, no código de cada exercício: `base`, `completo`, `base + {…}`, `restrito`.
- O modo livre usa `completo`.
- Um exercício que pede para provar uma regra exclui essa regra.
- Cada exercício tem uma solução guardada, verificada nos testes com o conjunto dele.
- As regras proibidas ficam desativadas no modo guiado e dão erro claro no modo de escrita.

### Regras do utilizador

- Definem-se em Provar, num esquema-tipo: nome, premissas e conclusão, com metavariáveis φ, ψ, θ.
  Uma premissa pode ser uma subdedução `[φ] … ψ`.
- Uma regra só é aceite se for sólida. Traduz-se o esquema para uma fórmula, em que a subdedução
  `[φ] … ψ` conta como φ → ψ, e exige-se que seja tautologia, tratando as metavariáveis como
  variáveis proposicionais. Se não for, mostra-se o contraexemplo.
- Guardam-se no `localStorage` e viajam no link partilhado, onde são validadas de novo ao abrir.
- Podem ser usadas no modo livre e nos exercícios.
- Cada exercício tem o campo `userRules`, ativo por omissão. Fica desligado nos exercícios com os
  conjuntos `base` ou `restrito` e nos que pedem para provar uma regra, porque aí uma regra própria
  anularia o objetivo.
- Uma prova que use regras do utilizador é assinalada como tal. No progresso dos exercícios, conta
  como «resolvido com regras próprias», à parte de «resolvido».
- Em 1.ª ordem as regras do utilizador continuam proposicionais. Um esquema proposicional que é
  tautologia continua sólido com φ, ψ, θ substituídas por fórmulas de 1.ª ordem, por isso serve em
  provas de 1.ª ordem sem mudar nada. Um esquema com quantificadores, termos ou `=` é recusado com uma
  mensagem clara.

## Solver

- Procura orientada pelas heurísticas da cadeira: assumir o antecedente, redução ao absurdo,
  casos para ∨. Respeita o conjunto de regras ativo.
- Antes de procurar, a tabela de verdade decide a validade. Se o sequente for inválido, mostra o
  contraexemplo.
- Toda a prova gerada passa pelo verificador antes de ser mostrada.

## Publicação

- Monorepo `computational-logic`, com `sat/` e `natural-deduction/` como pacotes independentes. Cada
  pasta tem um projeto Vercel próprio, ligado ao GitHub, com o Root Directory nessa pasta.
- Sem passo de build: os ficheiros gerados estão no repositório, e o `.vercelignore` deixa fora do
  deployment tudo o que não é o site.
- `sat/` é o site atual, sem alterar comportamento, e continua em
  `sat.computational-logic.miguelrocha.dev`. A dedução natural publica-se em
  `nd.computational-logic.miguelrocha.dev`.
- Código partilhado só é extraído depois de as duas ferramentas estarem estáveis.

## Dimensão do conteúdo

Lição de 9 secções e cerca de 60 exercícios, dos quais cerca de 10 são «encontra o passo errado».
Com a 1.ª ordem: lição de 14 secções e cerca de 90 exercícios, dos quais cerca de 15 são «encontra o
passo errado».

## Lógica de 1.ª ordem

Acrescenta ∀, ∃ e igualdade ao sistema, sem reescrever o motor. Esta secção manda sobre o
`ralph/FOL-PLAN.md`, que lhe deu origem.

### Publicação

- Desenvolve-se no ramo `primeira-ordem` e entra no `main` de uma só vez, com verificador, editor,
  contramodelos, solver, lição e exercícios. Os previews da Vercel servem para rever.
- Mesmas rotas: a lição e os exercícios crescem nas páginas existentes. O Provar e o Passo a passo
  detetam a 1.ª ordem pelo sequente, sem interruptor.

### Linguagem

- Termos: nome (`x`, `a`, `v`, `u1`) ou função com argumentos (`f(x, a)`). Fórmulas atómicas:
  predicado com argumentos (`P(x, f(a))`), predicado 0-ário (`p`, como na proposicional) e igualdade
  `t₁ = t₂`.
- Nomes sem tipo: não há convenção que separe variáveis de constantes. Um nome é variável se um
  quantificador o liga; livre, funciona como parâmetro. A solidez vem da condição «v nova».
- Nós do núcleo, todos com a forma `{ kind, name, args }`:
  - termo: `{ kind: "term", name, args }`;
  - átomo: `{ kind: "atom", name, args: [termos] }`;
  - igualdade: `{ kind: "eq", args: [t1, t2] }`;
  - quantificadores: `{ kind: "forall" | "exists", name: "x", args: [φ] }`.
- Precedência: os quantificadores ligam como o ¬, mais do que qualquer conectivo, por isso
  `∃x P(x) ∨ ¬P(x)` é `(∃x P(x)) ∨ ¬P(x)`. O `=` liga mais do que tudo e só junta termos.
- Impressão: `∀x P(x)`, `∀x(P(x) → Q(x))`, `∀x∀y R(x, y)`, `f(a) = b`, com o sufixo numérico em
  subscrito.
- Entrada:
  - quantificadores `∀` ou `forall`, `∃` ou `exists`; `forall` e `exists` passam a reservados;
  - a variável de um quantificador é uma letra seguida de dígitos opcionais, por isso `∀xP(x)` lê-se
    sem espaço; um nome mais comprido depois de um quantificador pede espaço ou parênteses;
  - o `v` é disjunção entre fórmulas e nome em posição de termo (argumento, variável de um
    quantificador ou etiqueta de caixa); não pode ser átomo proposicional;
  - o `F` continua reservado e `=>` continua a ser implicação.
- Funções do núcleo: variáveis livres, substituição `φ[t/x]` só das ocorrências livres,
  «x substituível por t em φ» (t livre para x em φ, como no livro) e igualdade a menos de α.
- α-equivalência: `∀y P(y)` e `∀x P(x)` contam como a mesma fórmula na conclusão, nas premissas do
  sequente e nas citações. O texto escrito pelo utilizador nunca é reescrito.
- Compatibilidade: todo o texto proposicional que hoje se lê dá a mesma fórmula e a mesma impressão,
  em sequentes, provas, exercícios, links e regras do utilizador guardadas.

### Regras

| Regra | Premissas | Conclusão | Condições |
| --- | --- | --- | --- |
| ∀E | ∀x φ | φ[t/x] | x substituível por t em φ |
| ∀I | caixa `[v] … φ[v/x]` | ∀x φ | v nova; v não está livre em ∀x φ |
| ∃I | φ[t/x] | ∃x φ | x substituível por t em φ |
| ∃E | ∃x φ, caixa `[v] φ[v/x] … ψ` | ψ | v nova; v não está livre em ψ |
| =I | nenhuma | t = t | nenhuma |
| =E | t₁ = t₂, φ[t₁/x] | φ[t₂/x] | x substituível por t₁ e por t₂ em φ |

- «v nova», como no livro («não ocorre antes»): v não ocorre em nenhuma linha acessível antes da
  caixa, premissas incluídas. Linhas dentro de caixas já fechadas não contam, por isso duas caixas
  irmãs podem usar o mesmo v. As linhas depois da caixa e a conclusão do sequente também não contam:
  o que impede v de escapar é a segunda condição (v não livre em ∀x φ, ou em ψ). Esta condição falta
  no livro e é precisa: sem ela, de ∀y P(y, y) tirava-se ∀x P(x, v).
- As siglas são iguais em PT e EN. As citações seguem as convenções proposicionais: o ∃E cita a linha
  do ∃ e o intervalo (`∃E, 2, 3–9`), nunca só o intervalo; o =E cita as duas linhas por qualquer ordem.
- No ∃I e no =E pode haver várias conclusões a partir das mesmas linhas: de `P(a, a)` sai
  `∃x P(x, a)`, `∃x P(a, x)` ou `∃x P(x, x)`. O verificador aceita qualquer uma que encaixe.
- Esquemas: entram uma metavariável de variável ligada (`x`), uma de termo (`t`) e o nó `φ[t/x]`.
  O `matchSchema` guarda `φ[t/x]` como restrição e resolve-a quando φ e x estiverem ligados,
  procurando t ao percorrer as duas fórmulas em paralelo. As condições (`fresh`, `notIn`,
  `substitutable`, `notFree`) são declarativas e é o verificador que as avalia. As regras continuam
  dados, e o modo guiado, a escolha de regra, a lição e as derivadas leem-nas como hoje.
- Derivadas novas, com prova só com regras base, verificada nos testes e mostrada na lição:

  | Derivada | Sigla PT | Sigla EN |
  | --- | --- | --- |
  | ¬∀x φ ⊢ ∃x ¬φ | NQ1 | QN1 |
  | ∃x ¬φ ⊢ ¬∀x φ | NQ2 | QN2 |
  | ¬∃x φ ⊢ ∀x ¬φ | NQ3 | QN3 |
  | ∀x ¬φ ⊢ ¬∃x φ | NQ4 | QN4 |

  NQ é «negação de quantificador», QN é «quantifier negation». O id de cada regra é a sigla PT.

### Caixas

- A variável nova do ∀I e do ∃E é uma etiqueta à margem da primeira linha da caixa:

  ```
  1 | ∀x(P(x) → Q(x))    premissa
  2 | ∀x P(x)            premissa
  3 |  [v] P(v) → Q(v)   ∀E, 1
  4 |      P(v)          ∀E, 2
  5 |      Q(v)          →E, 3, 4
  6 | ∀x Q(x)            ∀I, 3–5
  ```

- A caixa do ∃E abre na hipótese, que leva a etiqueta. A caixa do ∀I não tem hipótese própria: a
  etiqueta vai na primeira linha, que é um passo com a sua justificação, normalmente um ∀E.
- Quando a primeira linha dentro da caixa do ∀I tem de ser uma hipótese (de →I, ¬I, ∨E, RA ou ∃E), a
  etiqueta fica sozinha numa **linha de etiqueta**, sem número, sem fórmula e sem justificação. A
  hipótese abre a sua caixa por dentro, na linha seguinte:

  ```
    |  [v]
  1 |     P(v)             hipótese
  2 |   P(v) → P(v)        →I, 1–1
  3 | ∀x(P(x) → P(x))      ∀I, 1–2
  ```

  A linha de etiqueta não se cita; o intervalo do ∀I vai da primeira à última linha numerada da caixa.
  Nos outros casos a etiqueta fica na própria linha, e a linha de etiqueta não se usa.
- Não há duas caixas abertas na mesma linha.
- Modelo: uma linha ganha o campo `fresh` (nome ou null). Uma subdedução abre numa hipótese ou numa
  linha com `fresh`; uma hipótese pode ter `fresh` (∃E); um passo com `fresh` abre caixa sem hipótese
  (∀I). A linha de etiqueta é uma entrada com `fresh` e sem fórmula, fora da numeração.
- Formato de texto: `3 |  [v] P(v) → Q(v)   ∀E, 1`, com a indentação contada como numa hipótese. A
  linha de etiqueta escreve-se `  |  [v]`, sem número.
- Link partilhado: formato `p=2`, com o campo `fresh`. O `p=1` continua a ler-se.
- LaTeX, árvore de Gentzen, Fitch e leitor de ecrã mostram a variável da caixa.

### Semântica e solver

- A validade em 1.ª ordem é indecidível, por isso há três resultados: válido, com prova; inválido, com
  contramodelo; ou «não encontrei prova nem contramodelo». Nunca se afirma que não há prova sem
  demonstração.
- Contramodelos: procura de estruturas finitas com domínio de 1 a N elementos e um orçamento de
  avaliações. A estrutura mostra-se como domínio, constantes, funções e extensões dos predicados, e a
  fórmula é sempre reavaliada antes de se mostrar.
- Solver: procura com limite, guiada pelas heurísticas da cadeira: caixa para um objetivo ∀; ∃E sobre
  os ∃ acessíveis; ∀E e ∃I instanciados com os termos que já existem na prova; o clássico (RA) como na
  proposicional. Um sequente proposicional segue exatamente o caminho atual. Toda a prova gerada passa
  pelo verificador.
- O `countermodel.js`, que prova que não há prova com um conjunto de regras, só trata sequentes
  proposicionais. Em 1.ª ordem devolve null, o que o contrato já permite.

### Conteúdo

- Lição: cinco secções novas no fim de Aprender: linguagem (termos, predicados, livre e ligada,
  substituição); ∀; ∃; igualdade; equivalências e estratégias. O quiz ganha perguntas de 1.ª ordem.
- Exercícios: cerca de 25 de prova, em níveis novos, e cerca de 5 de «encontra o passo errado», como a
  variável que escapa da caixa.
- Texto, exemplos e enunciados originais. `conteudos/` só serve para confirmar regras.

### Fora do âmbito

Regras do utilizador com quantificadores, mais de uma caixa aberta por linha, o «encontra o passo
errado» gerado automaticamente e alterações ao `sat/`.
