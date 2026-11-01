# computational-logic

Monorepo das ferramentas didáticas de lógica computacional de Miguel Rocha. Cada pasta tem as suas regras
no `CLAUDE.md` próprio: lê-o antes de lhe tocar.

| Pasta | Conteúdo |
| --- | --- |
| `sat/` | Learn Davis-Putnam SAT |
| `natural-deduction/` | Learn Natural Deduction |
| `hub/` | página de entrada, quando existir |
| `ralph/` | loop da migração para monorepo |

## Regras

- Cada pasta é um pacote independente, com `package.json`, `node_modules` e `vercel.json` próprios, e um
  projeto Vercel com Root Directory nessa pasta. Sem workspaces.
- Os comandos `npm` e os `scripts/` de uma pasta correm dentro dela.
- Nenhuma pasta importa código de outra. Extrair código partilhado está adiado, como manda o `SPEC.md` da
  dedução natural.
- Uma alteração, um commit: não mistures pastas sem motivo.
- `.reference/`, `conteudos/` e `tmp/` nunca entram no git.
- Licença MIT, © 2026 Miguel Rocha.

## Comandos

- Testes de tudo: `scripts/test-all.sh`, em série, porque os testes do Chrome são sensíveis à carga da
  máquina. Corre sempre todas as suites e sai com erro se alguma falhar ou se faltar `sat/` ou
  `natural-deduction/`.
- Testes desse script: `scripts/test-test-all.sh`, com suites falsas. Corre-o depois de o alterar.
