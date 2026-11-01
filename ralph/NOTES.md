# Notas do loop

## M0 · Linha de base (2026-11-01, em `424f261`, sem alterações)

- SAT: 625 testes, 623 passam, 0 falham, 2 saltados (sem `pdflatex`), cerca de 3 a 3,5 s. 2 corridas.
- Dedução natural: 1120 testes, 1119 passam, 0 falham, 1 saltado (sem `pdflatex`), 99 a 101 s. 3 corridas.
- As 3 falhas por tempo da dedução natural não se repetiram em 3 corridas em série, com a máquina
  pouco carregada (14 núcleos, carga de 4,5 no início). É compatível com a carga como causa, mas não
  ficou provado: não se correu sob carga e não há registo de que testes falharam.
- Os testes do Chrome da dedução natural são os mais lentos (até 75 s cada). Não correr suites em paralelo.
- `scripts/test-all.sh` já existe, com `hub` incluído, antes da M1: a M1 parte dele.
- Os comandos compostos (`cd x && npm test`) e a escrita em `/tmp` pedem aprovação e falham sem ninguém
  a responder: faz `cd` numa chamada, `npm test` noutra, e guarda a saída em `ralph/logs/`.
