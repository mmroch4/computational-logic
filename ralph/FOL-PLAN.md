# Lógica de 1.ª ordem na dedução natural: desenho

Referência de todas as tarefas de `ralph/PLAN.md`. Diz o que se decidiu e porquê. O `SPEC.md` da
dedução natural passa a ser a fonte depois da tarefa S1; até lá, a fonte é este ficheiro.

## Decisões do autor (não se discutem nas sessões)

1. **Caixas à margem, como nos slides.** A variável nova do ∀I e do ∃E é uma etiqueta na primeira linha
   da caixa: no ∃E é a hipótese, no ∀I é um passo qualquer (normalmente um ∀E). Não há duas caixas
   abertas na mesma linha (o `v u` da Sol. 2.21 dos slides escreve-se pela outra ordem).

   ```
   1 | ∀x(P(x) → Q(x))    premissa
   2 | ∀x P(x)            premissa
   3 |  [v] P(v) → Q(v)   ∀E, 1
   4 |      P(v)          ∀E, 2
   5 |      Q(v)          →E, 3, 4
   6 | ∀x Q(x)            ∀I, 3–5
   ```

2. **Publicação única.** Tudo se faz no ramo `primeira-ordem` e só entra no `main` no fim, com
   verificador, editor, contramodelos, solver, lição e exercícios. Os previews da Vercel servem para rever.
3. **Mesmas rotas.** A lição e os exercícios crescem nas páginas existentes. O Provar e o Passo a passo
   detetam a 1.ª ordem pelo sequente, sem interruptor.
4. **ASCII dos quantificadores:** `forall x` e `exists x`, além de `∀` e `∃`.

## Recomendações adotadas (revistas na PAUSA-1)

- **Nomes sem tipo.** Um termo 0-ário é só um nome: não há convenção que separe variáveis de constantes.
  É variável se um quantificador o liga; livre, funciona como parâmetro. A solidez vem da condição
  «v nova». Os slides usam t, u, v como variáveis e a, b, c como constantes, e ambos os usos funcionam.
- **α-equivalência.** `∀y P(y)` e `∀x P(x)` contam como a mesma fórmula na conclusão, nas premissas do
  sequente e nas citações. O texto escrito pelo utilizador nunca é reescrito.
- **Regras do utilizador ficam proposicionais.** Um esquema proposicional que é tautologia continua
  sólido com φ, ψ, θ substituídas por fórmulas de 1.ª ordem (Prop. 2.4 dos apontamentos), por isso
  as regras atuais servem em provas de 1.ª ordem sem mudar nada. Um esquema com quantificadores, termos
  ou `=` é recusado com uma mensagem clara. A S1 corrige o `SPEC.md`, que dizia «será exigida uma prova».

## Linguagem

- Termos: nome (`x`, `a`, `v`, `u1`), ou função com argumentos (`f(x, a)`). Fórmulas atómicas:
  predicado com argumentos (`P(x, f(a))`), predicado 0-ário (`p`, como hoje) e igualdade `t₁ = t₂`.
- Nós, todos com a forma `{ kind, name, args }`:
  - termo: `{ kind: "term", name, args }`;
  - átomo: `{ kind: "atom", name, args: [termos] }`;
  - igualdade: `{ kind: "eq", args: [t1, t2] }`;
  - quantificadores: `{ kind: "forall" | "exists", name: "x", args: [φ] }`.
- **Precedência:** os quantificadores ligam como o ¬, mais do que qualquer conectivo:
  `∃x P(x) ∨ ¬P(x)` é `(∃x P(x)) ∨ ¬P(x)`. `=` liga mais do que tudo, e só junta termos.
- **Impressão:** `∀x P(x)`, `∀x(P(x) → Q(x))`, `∀x∀y R(x, y)`, `f(a) = b`, com o sufixo numérico em
  subscrito, como hoje.
- **Entrada:**
  - A variável de um quantificador é uma letra seguida de dígitos opcionais. Assim `∀xP(x)` lê-se sem
    espaço. Um nome mais comprido depois de um quantificador pede espaço ou parênteses.
  - O `v` é disjunção entre fórmulas e nome em posição de termo: argumento, variável de um quantificador
    ou etiqueta de caixa. Não pode ser átomo proposicional.
  - O `F` continua reservado.
  - `=>` continua a ser implicação. `forall` e `exists` passam a reservados.
- Funções do núcleo:
  - variáveis livres;
  - substituição `φ[t/x]` só das ocorrências livres;
  - «t substituível por x em φ» (Def. 2.13);
  - igualdade a menos de α.
- **Compatibilidade:** todo o texto proposicional que hoje se lê continua a dar a mesma fórmula e a
  mesma impressão. Isso abrange sequentes, provas, exercícios, links e regras do utilizador guardadas.

## Regras (Fig. 2.1 dos apontamentos)

| Regra | Premissas | Conclusão | Condições |
| --- | --- | --- | --- |
| ∀E | ∀x φ | φ[t/x] | t substituível por x em φ |
| ∀I | caixa `[v] … φ[v/x]` | ∀x φ | v nova: não ocorre em nenhuma linha anterior nem no sequente |
| ∃I | φ[t/x] | ∃x φ | t substituível por x em φ |
| ∃E | ∃x φ, caixa `[v] φ[v/x] … ψ` | ψ | v nova; v não ocorre em ψ |
| =I | nenhuma | t = t | nenhuma |
| =E | t₁ = t₂, φ[t₁/x] | φ[t₂/x] | x substituível por t₁ e por t₂ em φ |

- As siglas são iguais em PT e EN. As citações seguem as convenções atuais:
  - o ∃E cita a linha do ∃ e o intervalo, `∃E, 2, 3–9`, e nunca só o intervalo, como numa gralha dos slides;
  - o =E cita as duas linhas por qualquer ordem.
- No ∃I e no =E pode haver várias conclusões a partir das mesmas linhas: de `P(a, a)` sai `∃x P(x, a)`,
  `∃x P(a, x)` ou `∃x P(x, x)`. O verificador aceita qualquer uma que encaixe.
- A primeira linha de uma caixa de ∀I não é uma hipótese: é um passo com a sua própria justificação.
  A caixa do ∃E abre na hipótese.
- **Esquemas:**
  - entram uma metavariável de variável ligada (`x`), uma de termo (`t`) e o nó `φ[t/x]`;
  - `matchSchema` guarda `φ[t/x]` como restrição e resolve-a quando φ e x estiverem ligados, procurando
    t ao percorrer as duas fórmulas em paralelo;
  - as condições (`fresh`, `notIn`, `substitutable`, `notFree`) são declarativas e é o verificador que
    as avalia.
  - Assim, as regras continuam dados, e o `guided`, o `rule-pick`, a lição e as derivadas leem-nas como hoje.
- **Derivadas novas,** com prova só com regras base, verificada nos testes e mostrada na lição: as
  quatro formas de negação de quantificadores, ¬∀xφ ⊣⊢ ∃x¬φ e ¬∃xφ ⊣⊢ ∀x¬φ (Prop. 2.9). A S1 fixa
  as siglas PT e EN.

## Prova

- Uma linha ganha o campo `fresh` (nome ou null). Uma subdedução abre numa hipótese ou numa linha com
  `fresh`. Uma hipótese pode ter `fresh` (∃E). Um passo com `fresh` abre caixa sem hipótese (∀I).
- Formato de texto: `3 |  [v] P(v) → Q(v)   ∀E, 1`. A indentação conta como numa hipótese.
- Link partilhado: formato `p=2` com o campo `fresh`. O `p=1` continua a ler-se.
- LaTeX, árvore de Gentzen, Fitch e leitor de ecrã mostram a variável da caixa.

## Semântica e solver

- A validade em 1.ª ordem é indecidível, por isso há três resultados: válido com prova, inválido com
  contramodelo, ou «não encontrei prova nem contramodelo». Nunca se afirma que não há prova sem
  demonstração.
- **Contramodelos:** procura de estruturas finitas com domínio de 1 a N elementos, com orçamento de
  avaliações. A estrutura mostra-se como domínio, constantes, funções e extensões dos predicados.
  A fórmula é sempre reavaliada antes de se mostrar.
- **Solver:**
  - procura com limite, guiada pelas heurísticas dos slides: caixa para um objetivo ∀; ∃E sobre os ∃
    acessíveis; instanciar ∀E e ∃I com os termos que já existem na prova; o clássico (RA) como hoje;
  - um sequente proposicional segue exatamente o caminho atual;
  - toda a prova gerada passa pelo verificador.
- O `countermodel.js`, que prova que não há prova com um conjunto de regras, só trata sequentes
  proposicionais. Em 1.ª ordem devolve null, o que o contrato já permite.

## Conteúdo

- Lição: secções novas no fim de Aprender:
  - linguagem: termos, predicados, livre e ligada, substituição;
  - ∀;
  - ∃;
  - igualdade;
  - equivalências e estratégias.
  O quiz ganha perguntas de 1.ª ordem.
- Exercícios: cerca de 25 de prova, em níveis novos, e cerca de 5 de «encontra o passo errado». Um bom
  exemplo de passo errado é a variável que escapa da caixa.
- Todo o texto, exemplos e enunciados são originais. `conteudos/` só serve para confirmar regras.

## Fora do âmbito

Regras do utilizador com quantificadores, mais de uma caixa aberta por linha, o «encontra o passo errado»
gerado automaticamente, e alterações ao `sat/`.
