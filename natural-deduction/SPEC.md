# Ferramenta de dedução natural: especificação

Site público, gratuito e estático para aprender a fazer provas no sistema DN, em notação de Fitch.
Segue a base técnica do `davis-putnam-sat`: HTML estático, ES modules, `js/core/` puro, i18n PT/EN.

## Âmbito

- Lançamento: lógica proposicional, com ∧, ∨, ¬, →, F.
- Segunda fase: lógica de 1.ª ordem (∀, ∃, igualdade). O motor representa fórmulas e regras de forma
  a não ter de ser reescrito.
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
- Em 1.ª ordem não há tabelas de verdade, por isso será exigida uma prova da regra.

## Solver

- Procura orientada pelas heurísticas da cadeira: assumir o antecedente, redução ao absurdo,
  casos para ∨. Respeita o conjunto de regras ativo.
- Antes de procurar, a tabela de verdade decide a validade. Se o sequente for inválido, mostra o
  contraexemplo.
- Toda a prova gerada passa pelo verificador antes de ser mostrada.

## Publicação

- Monorepo `computational-logic`: `sat/` com o site atual, sem alterar comportamento, e
  `natural-deduction/` com projeto Vercel próprio.
- Código partilhado só é extraído depois de as duas ferramentas estarem estáveis.
- Mover o SAT exige confirmação, porque esse site já está publicado.

## Dimensão do conteúdo

Lição de 9 secções e cerca de 60 exercícios, dos quais cerca de 10 são «encontra o passo errado».

## Construção

A ordem das tarefas está em `ralph/PLAN.md`. A mudança para o monorepo e a publicação ficam fora do
loop.
