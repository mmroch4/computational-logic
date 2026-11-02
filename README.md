# Computational Logic

Free, interactive websites to learn computational logic, in English and Portuguese. Each tool is a
static site, with no framework and no account, and with its progress kept in the browser.

| Tool | What it teaches | Folder | Live site |
| --- | --- | --- | --- |
| Learn Davis-Putnam SAT | The Davis-Putnam (DPLL) algorithm for the Boolean satisfiability problem: every unit propagation, branch and conflict, step by step. | [`sat/`](sat/README.md) | [English](https://sat.computational-logic.miguelrocha.dev/en) · [Português](https://sat.computational-logic.miguelrocha.dev) |
| Learn Natural Deduction | Natural deduction proofs in Fitch notation, for propositional logic: a line-by-line editor, generated proofs explained step by step, a lesson and exercises. | [`natural-deduction/`](natural-deduction/README.md) | [English](https://nd.computational-logic.miguelrocha.dev/en) · [Português](https://nd.computational-logic.miguelrocha.dev) |

The [`hub/`](hub/README.md) folder holds the entry page that presents both tools, live at
[computational-logic.miguelrocha.dev](https://computational-logic.miguelrocha.dev).

## Repository layout

```
sat/                  Learn Davis-Putnam SAT
natural-deduction/    Learn Natural Deduction
hub/                  entry page that links to the tools
scripts/              test runner for all the tools
```

Each tool is an independent package, with its own `package.json`, `node_modules` and `vercel.json`, and
there are no workspaces. No tool imports code from another. The README of each folder explains how to
run, build and test that tool, and its commands run inside the folder.

## Running a tool locally

Running a site needs Node but no `npm install`:

```sh
git clone https://github.com/mmroch4/computational-logic.git
cd computational-logic/sat       # or natural-deduction
node scripts/serve.mjs 8765      # http://localhost:8765/
```

## Tests

Install the dependencies of each tool with `npm install` inside its folder, then run every suite from
the repository root:

```sh
scripts/test-all.sh
```

The suites run one after the other, because the Chrome tests are sensitive to machine load. The script
always runs all of them and exits with an error if any fails. It needs Node 22 or later, and Chrome at
`/usr/bin/google-chrome`.

## Deployment

Each tool is a separate Vercel project, with its Root Directory set to the tool's folder. There is no
build step: generated files are committed.

## License

[MIT](LICENSE) © 2026 Miguel Rocha

## Credits

Developed by **Miguel Rocha** · [miguelrocha.dev](https://miguelrocha.dev)
