És uma sessão nova de um loop automático, sem ninguém a responder. Fazes **uma única tarefa** e paras.

## Contexto a ler

1. O `CLAUDE.md` da raiz e o de `natural-deduction/`. Se a tarefa toca no `hub/`, também o dele.
2. `ralph/FOL-PLAN.md`, só as secções que a tarefa usa. Depois da S1, a secção da 1.ª ordem do
   `natural-deduction/SPEC.md` manda sobre o `FOL-PLAN.md`.
3. `ralph/NOTES.md`, com as decisões e armadilhas de sessões anteriores.
4. `git log --oneline -15`.

Estás no ramo `primeira-ordem`, que não podes mudar. Cada pasta é um pacote independente: os comandos
`npm` e os `scripts/` correm dentro dela. O script recusa a tarefa se alterares o `sat/`, ou o `hub/` fora
da tarefa que o autoriza.

Lê só o que a tarefa precisa. Procura com Grep antes de abrir ficheiros grandes, e lê os ficheiros
grandes por partes. Os PDFs de `natural-deduction/conteudos/` só servem para confirmar uma regra; o
`ralph/FOL-PLAN.md` já tem o essencial.

## Regras

- Faz só o que a tarefa pede. Não comeces a tarefa seguinte nem refatores código não relacionado.
- Não edites `ralph/PLAN.md`, `ralph/run.sh` nem `ralph/FOL-PLAN.md`. O script marca as tarefas.
- `js/core/` continua puro e todas as strings visíveis vão para os dois locales. As páginas EN são
  geradas, e conteúdo, exemplos e exercícios são originais. Segue o `CLAUDE.md` da dedução natural.
- Cada comportamento novo tem testes. Não apagues nem enfraqueças testes para os fazer passar. Os
  snapshots proposicionais não mudam sem uma nota em `ralph/NOTES.md`.
- Antes de terminar, corre o `npm test` em `natural-deduction/` (e no `hub/`, se lhe tocaste) e, se
  mudaste a UI, o `scripts/check-page.sh` das páginas afetadas. O script volta a correr tudo com
  `scripts/test-all.sh`.
- Se mudaste classes, páginas ou imports, corre os builds correspondentes do `CLAUDE.md`, pela ordem dele.
- Os comandos compostos (`cd x && …`) e a escrita em `/tmp` pedem aprovação e falham sem ninguém a
  responder. Faz o `cd` numa chamada e o comando noutra, e guarda saídas longas em `tmp/` da raiz.
- Se tomares uma decisão ou encontrares uma armadilha que afete tarefas futuras, acrescenta uma linha a
  `ralph/NOTES.md`, na secção da tua tarefa. Mantém o ficheiro curto: é lido por todas as sessões.
- No fim, faz um único commit com `git add` dos ficheiros da tarefa e a mensagem
  `<ID>: <descrição>`, terminada por uma linha vazia e por:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Nunca faças push nem alteres a configuração do git.

## Quando não consegues avançar

Não improvises se:
- faltar uma permissão;
- o `SPEC.md` ou o `FOL-PLAN.md` forem omissos numa decisão de produto;
- a tarefa se revelar impossível como está escrita.

Nesses casos, escreve o motivo em `ralph/NOTES.md`, faz commit do que for seguro e termina com a linha de
bloqueio abaixo. Para decisões técnicas pequenas, decide tu e regista.

## Última linha da resposta

Exatamente uma destas:

```
<promise>TASK_DONE</promise>
<promise>BLOCKED: motivo curto</promise>
```

Só uses TASK_DONE se todos os critérios «Feito quando» estiverem cumpridos e o commit estiver feito.
