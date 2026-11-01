# Notas do loop

## M0 · Linha de base (2026-11-01, em `424f261`, sem alterações)

- SAT: 625 testes, 623 passam, 0 falham, 2 saltados (sem `pdflatex`), cerca de 3 a 3,5 s. 2 corridas.
- Dedução natural: 1120 testes, 1119 passam, 0 falham, 1 saltado (sem `pdflatex`), 99 a 101 s. 3 corridas.
- As 3 falhas por tempo da dedução natural não se repetiram em 3 corridas em série, com a máquina
  pouco carregada (14 núcleos, carga de 4,5 no início). É compatível com a carga como causa, mas não
  ficou provado: não se correu sob carga e não há registo de que testes falharam.
- Os testes do Chrome da dedução natural são os mais lentos (até 75 s cada). Não correr suites em paralelo.
- Os comandos compostos (`cd x && npm test`) e a escrita em `/tmp` pedem aprovação e falham sem ninguém
  a responder: faz `cd` numa chamada, `npm test` noutra, e guarda a saída em `ralph/logs/`.

## M1 · Raiz do repositório

- `scripts/test-all.sh` falha se faltar `sat/` ou `natural-deduction/`; o `hub` só conta quando a pasta existir, por isso a M5 só tem de criar `hub/package.json`.
- `scripts/test-test-all.sh` testa esse script com suites falsas. Não corre no `gate()`: corre-o se alterares o `test-all.sh`.
- Corrida completa: cerca de 102 s (SAT 4 s, dedução natural 98 s), muito abaixo dos 3600 s do `TASK_TIMEOUT`.

## M2 · Serviços e isolamento das pastas

- Sem alterações de código: `repository`, `serve.mjs`, `deploy.test.js`, `docs.test.js` e `smoke-deploy.sh` já resolvem caminhos a partir da pasta do pacote. Só mudou o comentário do `.vercelignore` da dedução natural.
- Isolamento provado com a outra pasta afastada: SAT 623/625 e dedução natural 1119/1120 (saltados só por `pdflatex`), smoke local OK nas duas.
- Pendente para a M4: `sat/.vercelignore:2` ainda diz «raiz do repositório»; a M2 não pode tocar em `sat/`.
- `sat/tests/deploy.test.js` usa `git ls-files`: exige que a pasta esteja num repositório git, mas não que seja a raiz.
- Compostos com `;` ou variáveis podem ser recusados: um passo por chamada.

## M3 · A referência passa a ser `../sat`

- O loop antigo está em `ralph/archive/natural-deduction/`. Os testes de deploy continuam a exigir `/ralph` e `/.reference` no `.vercelignore` e o 404 em `/ralph/PLAN.md`, que agora passa também por o ficheiro não existir. O `natural-deduction/.gitignore` ficou igual.

## M4 · Documentação

- Ao publicar a dedução natural (etapa 6.3), repor o «Live site» em `natural-deduction/README.md` e trocar «Not published yet» no `README.md` da raiz.
- O `natural-deduction/tests/docs.test.js` passou a verificar os links relativos da pasta. `sat/` não tem `docs.test.js`, e os links do SAT e da raiz verificaram-se à mão.
- O `README.md` da raiz não cita o hub: a M5 acrescenta-o à tabela e à estrutura.
