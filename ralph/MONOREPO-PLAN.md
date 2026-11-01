# Plano: monorepo `computational-logic` com um Ralph loop

Objetivo: juntar as duas ferramentas no repositório público `mmroch4/computational-logic`, com `sat/`,
`natural-deduction/` e `hub/`, cada um com projeto Vercel próprio, sem o site do SAT ficar em baixo.
O hub `computational-logic.miguelrocha.dev` apresenta as duas ferramentas e liga para elas; `sat.` e
`nd.` mantêm os seus endereços.

Respostas do Miguel (2026-11-01): o SAT publica a partir do GitHub; `SPEC.md`, `DESIGN.md` e notas podem
ficar públicos; há ligações entre os sites.

## 1. Estado de partida (verificado em 2026-11-01)

| Item | Estado |
| --- | --- |
| `davis-putnam-sat/` | ramo `main` em `ac9dfe8`, igual ao `origin/main`, 2 commits, árvore limpa |
| `natural-deduction/` | ramo `master` em `8dea360`, 94 commits, sem remoto |
| GitHub | repositório **público**, ramo por omissão `main`; `gh` autenticado como `mmroch4` |
| `sat.computational-logic.miguelrocha.dev` | no ar (HTTP 200) |
| `nd.computational-logic.miguelrocha.dev` | ainda não resolve |
| `computational-logic.miguelrocha.dev` (hub) | ainda não resolve; passa a fazer parte do plano |
| Vercel | sem pasta `.vercel` e sem CLI local; o SAT publica a partir do GitHub (confirmado pelo Miguel) |
| Histórico da dedução natural | sem `conteudos/`, `.reference/`, `tmp/` nem logs; sem segredos detetados; maior ficheiro com cerca de 110 KB |

## 2. Decisões de desenho

1. **Sem reescrever o histórico.** O `monorepo` nasce por cima de `ac9dfe8`, por isso o `main` avança em
   fast-forward e nunca há force push. Os dois históricos ficam completos.
2. **A mudança estrutural é um script, não uma sessão de IA.** O `ralph/bootstrap.sh` faz a parte
   mecânica de forma determinística, com a mesma saída a cada execução. O loop só trata do que exige
   juízo: configuração, testes e documentação.
3. **Os originais não se tocam.** Tudo se constrói numa cópia nova em
   `~/Desktop/computational-logic-monorepo`. Até à troca final, voltar atrás é apagar essa pasta.
4. **O loop nunca publica.** Fica sem push, sem `curl` e sem acesso à Vercel. A publicação é a etapa
   manual da secção 6.
5. **Pacotes independentes.** Cada pasta mantém `package.json`, `node_modules` e `vercel.json` próprios,
   sem workspaces. Extrair código partilhado continua adiado, como o `SPEC.md` manda.
6. **O ramo de trabalho é `monorepo`.** Todos os commits ficam aí até à aprovação.
7. **Os materiais de loop antigos arquivam-se.** `natural-deduction/ralph/` passa para
   `ralph/archive/natural-deduction/`, porque o `run.sh` antigo faria `git init` dentro do monorepo.
   `SPEC.md` e o arquivo ficam públicos.

## 3. Estrutura final

```
computational-logic/
├── README.md               novo: apresenta as duas ferramentas
├── LICENSE                 MIT, © 2026 Miguel Rocha
├── CLAUDE.md               novo: regras do monorepo, curto
├── .gitignore              node_modules, tmp, .vercel, .claude, ralph/logs
├── ralph/                  loop desta migração e arquivo do anterior
├── scripts/test-all.sh     corre os testes das duas ferramentas, em série
├── hub/                    página de entrada, HTML estático
├── sat/                    o site atual, sem alterações de comportamento
└── natural-deduction/      com conteudos/ e .reference/ fora do git
```

## 4. Configuração do loop

Criado em `ralph/`, a partir do `run.sh` atual, com estas alterações:

| Parte | Alteração |
| --- | --- |
| `bootstrap()` | Sai: o repositório já existe. Em vez disso, recusa correr fora do ramo `monorepo` |
| `gate()` | Corre `scripts/test-all.sh`, verifica a árvore limpa e as invariantes abaixo |
| `ALLOWED_TOOLS` | Acrescenta `git mv`, `git rm` e `Bash(scripts/test-all.sh*)`; `npm` com `--prefix` |
| `DENIED_TOOLS` | Mantém push, remote, config, reset, `rm -rf`, `curl` e `wget`; acrescenta `git rebase`, `git merge`, `git checkout main`, `git switch` e `Edit(ralph/bootstrap.sh)` |
| `MODEL` | Opus, como antes |
| `TASK_TIMEOUT` | Mantém 3600 s; duas suites em série cabem aí, mas confirmar na tarefa M1 |
| `PROMPT.md` | Atualizado: contexto do monorepo, `CLAUDE.md` raiz e o da pasta tocada, invariantes |
| `NOTES.md` | Novo e vazio; as notas antigas vão para o arquivo |

### Invariantes do `gate()`

São o que impede uma sessão de alterar o site sem dar por isso, e não dependem da palavra da sessão:

- `sat/` tem de ficar igual a `ac9dfe8`: `git rev-parse HEAD:sat` igual à árvore de `ac9dfe8`, salvo as
  tarefas autorizadas no `run.sh`.
- Só podem mudar em `natural-deduction/` os ficheiros previstos: `CLAUDE.md`, `README.md`, `SPEC.md`,
  `package.json`, `vercel.json` e `.vercelignore`, mais os testes da documentação e do deploy.
- `.reference/`, `conteudos/` e `tmp/` nunca entram no git.
- Nenhuma sessão pode ter mudado de ramo ou reescrito commits: o commit inicial do `monorepo` continua
  antepassado de `HEAD`.

### `ralph/bootstrap.sh`

Corre uma vez, antes do loop, e para ao primeiro erro:

```bash
git clone git@github.com:mmroch4/computational-logic.git ~/Desktop/computational-logic-monorepo
cd ~/Desktop/computational-logic-monorepo
git switch -c monorepo

# Passo 1: o SAT desce para sat/
mkdir sat && git ls-tree --name-only HEAD | xargs -I{} git mv {} sat/
git commit -m "Move o site do SAT para sat/"

# Passo 2: a dedução natural entra com o histórico
git remote add nd ../computational-logic/natural-deduction
git fetch nd master
git merge -s ours --no-commit --allow-unrelated-histories nd/master
git read-tree --prefix=natural-deduction/ -u nd/master
git commit -m "Junta a dedução natural com o histórico"
git remote remove nd

# Passo 3: confirma que nada se perdeu
test "$(git rev-parse HEAD:sat)" = "$(git rev-parse 'ac9dfe8^{tree}')"
test "$(git rev-parse HEAD:natural-deduction)" = "$(git -C ../computational-logic/natural-deduction rev-parse 'HEAD^{tree}')"

# Passo 4: dependências e ficheiros fora do git
(cd sat && npm ci)
(cd natural-deduction && npm ci)
cp -a ../computational-logic/natural-deduction/conteudos natural-deduction/
```

Por último, copia para `ralph/` o loop preparado e faz commit.

## 5. Tarefas do loop

Cada uma é uma sessão nova com critério verificável. Custo orientativo: 10 a 25 USD, com base nos
cerca de 2 USD por tarefa da construção anterior, contando com algumas repetições.

### [ ] M0 · Linha de base
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

## 6. Etapas manuais, fora do loop

A ordem importa: mudar o Root Directory só tem efeito no deployment seguinte, por isso o site atual
continua no ar enquanto se prepara o novo.

### 6.1 Validar antes de tocar no `main`
1. Confirma no painel da Vercel que o projeto do SAT está ligado ao GitHub. Se não estiver, para: esta
   sequência não se aplica.
2. Procura segredos em todo o histórico do `monorepo` e, se estiver limpo, faz push desse ramo. Isto
   **torna o trabalho público**, mesmo sem chegar a `main`.
3. Se o deployment de preview desse push falhar por o SAT já não estar na raiz, é esperado.
4. No projeto do SAT: Root Directory = `sat`, e ativa «Skip deployments» para pastas sem alterações.
5. Faz redeploy do preview do ramo e valida:
   - `scripts/smoke-deploy.sh <url-do-preview>`, a partir de `sat/`.
   - `/package.json` tem de dar 404. Se der 200, o `.vercelignore` não foi aplicado: **para aqui**.

### 6.2 Passar para produção
1. Fast-forward de `main` para `monorepo` e push.
2. `scripts/smoke-deploy.sh https://sat.computational-logic.miguelrocha.dev`.
3. Se algo correr mal: Instant Rollback para o deployment anterior no painel e reverte o Root Directory.

### 6.3 Publicar a dedução natural
1. Novo projeto Vercel no mesmo repositório, com Root Directory = `natural-deduction`.
2. Sem comando de build, porque os ficheiros gerados estão no repositório.
3. Domínio `nd.computational-logic.miguelrocha.dev` e o DNS respetivo.
4. Ativa o Web Analytics.
5. `scripts/smoke-deploy.sh https://nd.computational-logic.miguelrocha.dev` e o `scripts/lighthouse.sh`.

### 6.4 Publicar o hub
1. Novo projeto Vercel com Root Directory = `hub`.
2. Domínio `computational-logic.miguelrocha.dev` e o DNS respetivo.

### 6.5 Troca das pastas locais
Com tudo validado, `computational-logic/` passa a `computational-logic.old/`, e a cópia nova passa a
`computational-logic/`. Copia `.reference/` só se ainda fizer falta. Assim, o caminho
`natural-deduction/` e a memória do Claude Code mantêm-se. Apagar o `.old` fica para mais tarde.

## 7. Riscos

| Risco | Efeito | Proteção |
| --- | --- | --- |
| O push para `main` antes de mudar o Root Directory | deployment do SAT sem site na raiz | ordem da etapa 6.1; preview primeiro |
| O `.vercelignore` não se aplicar numa subpasta | ficheiros internos servidos | teste a `/package.json` no preview |
| Uma sessão alterar `sat/` | mudança silenciosa no site | invariante por hash de árvore no `gate()` |
| Testes lentos por carga | falsos negativos e tentativas gastas | correr com a máquina livre; linha de base na M0 |
| Cada push gerar deployments nos dois projetos | ruído e minutos gastos | «Skip deployments» por pasta |
| Publicar `SPEC.md` e notas do loop | decisões internas ficam públicas | sem segredos encontrados; ver questão A |
| Histórico exposto | irreversível depois do push | procura de segredos em todo o `monorepo` antes do push (passo 6.1.2) |

## 8. Fora de âmbito

- Extrair código partilhado.
- Um só domínio para as duas ferramentas.
- CI no GitHub: o repositório não tem hoje, e os testes precisam do Chrome.
