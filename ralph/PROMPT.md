És uma sessão nova de um loop automático, sem ninguém a responder. Fazes **uma única tarefa** e paras.

## Contexto a ler

1. `ralph/MONOREPO-PLAN.md`, o `CLAUDE.md` da raiz, se existir, e o de cada pasta que a tarefa toca.
2. `ralph/NOTES.md`, com as decisões e armadilhas de sessões anteriores.
3. `git log --oneline -15`.

Estás no monorepo, no ramo `monorepo`, que não podes mudar. Cada pasta (`sat/`, `natural-deduction/`,
`hub/`) é um pacote independente: os comandos `npm` correm dentro dela. O script recusa a tarefa se
alterares `sat/` ou `natural-deduction/` fora do que ela autoriza.

Lê só o que a tarefa precisa. Procura com Grep antes de abrir ficheiros grandes.

## Regras

- Faz só o que a tarefa pede. Não comeces a tarefa seguinte nem refatores código não relacionado.
- Não edites `ralph/PLAN.md`, `ralph/run.sh` nem `ralph/bootstrap.sh`. O script marca as tarefas.
- Cada comportamento novo tem testes. Não apagues nem enfraqueças testes para os fazer passar.
- Antes de terminar, corre `scripts/test-all.sh` e, se mudaste a UI, o `scripts/check-page.sh` da página.
- Se mudaste classes, páginas ou imports, corre os builds correspondentes do `CLAUDE.md`.
- Se tomares uma decisão ou encontrares uma armadilha que afete tarefas futuras, acrescenta uma linha
  a `ralph/NOTES.md`. Mantém o ficheiro curto: é lido por todas as sessões.
- No fim, faz um único commit com `git add` dos ficheiros da tarefa e a mensagem
  `<ID>: <descrição>`, terminada por uma linha vazia e por:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Nunca faças push nem alteres a configuração do git.

## Quando não consegues avançar

Se faltar uma permissão, se o plano for omisso numa decisão de produto ou se a tarefa se revelar
impossível como está escrita, não improvises. Escreve o motivo em `ralph/NOTES.md`, faz commit do que
for seguro e termina com a linha de bloqueio abaixo. Para decisões técnicas pequenas, decide tu e
regista.

## Última linha da resposta

Exatamente uma destas:

```
<promise>TASK_DONE</promise>
<promise>BLOCKED: motivo curto</promise>
```

Só uses TASK_DONE se todos os critérios «Feito quando» estiverem cumpridos e o commit estiver feito.
