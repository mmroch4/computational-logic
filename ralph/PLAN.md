# Plano da migração para monorepo

Cada `### [ ]` é uma tarefa, feita por uma sessão nova. O `ralph/run.sh` marca-as e para nas `PAUSA`.
O detalhe e os motivos estão em `ralph/MONOREPO-PLAN.md`.

## Tarefas

### [x] M0 · Linha de base
Corre os testes das duas pastas sem alterar nada e regista em `ralph/NOTES.md` quantos passam, quais
falham e quanto demoram. É aqui que se confirma se as 3 falhas por tempo da dedução natural eram mesmo
da carga da máquina.
**Feito quando:** as duas suites passam numa corrida limpa. Se o SAT falhar antes de qualquer alteração,
ou a dedução natural falhar de forma repetível, a sessão bloqueia: não corrige nada nesta tarefa.

### [ ] M1 · Raiz do repositório
Cria `.gitignore`, `LICENSE`, `CLAUDE.md` e `scripts/test-all.sh`. O script corre as duas suites em
série, com saída clara e código de erro correto.
**Feito quando:** `scripts/test-all.sh` passa, e falha se uma das suites falhar.

### [ ] M2 · Serviços e isolamento das pastas
Procura caminhos que assumam a raiz do repositório: `repository` nos `package.json`, `.vercelignore`,
`scripts/serve.mjs`, `tests/deploy.test.js`, `tests/docs.test.js`. Na dedução natural, mantém a regra
de `.vercelignore`. Confirma que correr cada `npm test` numa pasta não depende da outra.
**Feito quando:** cada pasta passa os testes sozinha, e `scripts/smoke-deploy.sh` local passa nas duas.

### [ ] M3 · A referência passa a ser `../sat`
Na dedução natural, muda o `CLAUDE.md` para referir `../sat` em vez de `.reference/sat/`, mantendo a
regra de não importar dele em runtime e a de não misturar alterações. Arquiva `natural-deduction/ralph/`
em `ralph/archive/natural-deduction/`. Mantém as entradas do `.vercelignore` e o teste de deploy.
**Feito quando:** não existe `natural-deduction/ralph/`, e os testes e os `docs.test.js` passam.

### [ ] M4 · Documentação
Escreve o `README.md` da raiz, em inglês, com as duas ferramentas. Corrige no `README.md` da dedução
natural o caminho de clonar e o «Live site», que só deve surgir quando o endereço existir. Atualiza a
secção Publicação do `SPEC.md`. No SAT, autorizado nesta tarefa, só o que depender de caminhos.
**Feito quando:** todos os links relativos resolvem, e os `docs.test.js` passam.

### [ ] M5 · Hub
Cria `hub/`: página estática em PT (`/`) e EN (`/en`), com as duas ferramentas, créditos como no SAT,
sem framework nem build, com `vercel.json`, CSP e testes `node --test`.
**Feito quando:** os testes passam, a página valida a 390px e `hub/` entra no `scripts/test-all.sh`.

### [ ] PAUSA-1 · Revisão antes de publicar
Revês `git log` e `git diff ac9dfe8..monorepo --stat -- sat/`. Se estiver bem, segue a etapa 6.1 e 6.2.
O loop retoma quando os três sites estiverem no ar.

### [ ] M6 · Ligações entre as ferramentas
**Só depois de os três sites estarem no ar.** Acrescenta nos dois rodapés links para o hub e para a outra
ferramenta, levanta a regra do `CLAUDE.md` do SAT que proibia ligar ao hub, com
as strings em ambos os locales, EN gerado pelo `build:pages`, e testes. É a única alteração visível ao
SAT, autorizada nesta tarefa, com um commit próprio.
**Feito quando:** o link aparece em todas as páginas PT e EN, a 390px, sem scroll horizontal, com as
verificações de página a passar nas duas pastas.

### [ ] PAUSA-2 · Revisão final
Revês as ligações, antes de as publicares.
