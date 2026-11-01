# Learn Natural Deduction

A free, interactive website to learn **natural deduction** proofs in Fitch notation, for propositional
logic. Write a sequent and prove it line by line, with every line checked as you go, or watch a
generated proof step by step, with the strategy behind each step.

**Live site:** [English](https://nd.computational-logic.miguelrocha.dev/en) ·
[Português](https://nd.computational-logic.miguelrocha.dev)

## Pages

Each page has its own URL in each language: Portuguese at the root, English under `/en`.

| Page | Portuguese | English | What it does |
| --- | --- | --- | --- |
| Home | `/` | `/en` | Introduction, a proof that writes itself and a quick way into the other pages. |
| Prove | `/provar` | `/en/prove` | Free editor: type a proof or pick lines and a rule, with hints, automatic solutions, counterexamples, a Gentzen tree view, LaTeX and PDF export, shareable links and your own rules. |
| Step by step | `/passo-a-passo` | `/en/step-by-step` | Replays a generated proof and explains each step, in Fitch or as a tree, with a timeline and keyboard controls. |
| Learn | `/aprender` | `/en/learn` | A nine-section lesson: rules, subproofs, strategies, derived rules with their proofs, proof labs and a final quiz. |
| Exercises | `/exercicios` | `/en/exercises` | Graded proofs and "find the wrong step" challenges. Progress stays in your browser. |

State lives in the URL, so any proof can be shared with a link: `?s=…&p=…&r=…` on Prove (sequent, proof
and the user rules it cites) and `?s=…&step=N&view=fitch|tree` on Step by step. Switching language keeps
the query and the lesson section.

## Input

Sequents are written as `p -> q, p |- q`, and the editor accepts the same formulas line by line.

Negation `¬ ~ - !` · conjunction `∧ & /\ ^` · disjunction `∨ | \/ v` · implication `→ -> =>` · falsum `F`
or `⊥`, always shown as **F**. Variables match `[A-Za-z][A-Za-z0-9_]*`, and a numeric suffix renders as a
subscript (`p11` → p₁₁). `v` and `F` are reserved, so they cannot be variables.

## Proof conventions

- **Base rules:** ∧I, ∧E, ∨I, ∨E, ¬I, ¬E, FI, FE, →I, →E, R. ¬E is only ¬¬φ ⊢ φ.
- **Derived rules:** MT, ¬¬I, RAA, LEM, DM, HS, DS. Each one keeps a proof that uses base rules only,
  checked by the tests and shown in the lesson. In Portuguese they are MT, ¬¬I, RA, TE, DM, SH, SD.
- **Citations:** earlier accessible lines are cited directly, without R. R only repeats a formula. The
  order of the cited lines is free, and a subproof is cited as a range, `2–4`.
- **Rule sets:** the free editor uses every rule. Each exercise sets its own: `base`, `completo` (all
  rules), base plus a few, or `restrito` (only the listed ones). An exercise that asks you to prove a rule
  excludes that rule.
- **User rules:** defined on Prove as a schema with metavariables φ, ψ, θ, where a premise can be a
  subproof `[φ] … ψ`. A rule is only accepted if it is sound: the schema, with `[φ] … ψ` read as φ → ψ,
  must be a tautology. Otherwise the site shows a counterexample. A proof that uses them is marked as such
  and counts apart from "solved" in the exercises.
- **Solver:** a truth table decides validity first, so an invalid sequent gets a counterexample. The
  search follows the usual heuristics (assume the antecedent, reductio, cases for ∨) and respects the active
  rule set, and every generated proof goes through the verifier before it is shown.
- Truth values are T/F in English and V/F in Portuguese.

## Running locally

The site is plain static files: HTML, native ES modules and a compiled `css/app.css`, with no framework.
Running it needs Node but no `npm install`.

```sh
git clone https://github.com/mmroch4/computational-logic.git
cd computational-logic/natural-deduction
node scripts/serve.mjs 8765      # http://localhost:8765/
```

`scripts/serve.mjs` behaves like the production host (clean URLs, the headers from `vercel.json`,
compression, the 404 page, and whatever `.vercelignore` leaves out). A plain static server such as
`python3 -m http.server` will not open `/provar` or the English pages, and opening the files with `file://`
does not work, because browsers block ES modules there.

## Building

Generated files are committed, so the host only serves files and compiles nothing. Run `npm install` once,
then the build that matches what you changed:

| Command | When | What it generates |
| --- | --- | --- |
| `npm run build:css` | Classes or `css/src/` changed | `css/app.css` (Tailwind CSS v4 and Basecoat). `npm run watch:css` rebuilds on save, without minifying. |
| `node scripts/modulepreload.mjs` | Imports changed | The `<link rel="modulepreload">` tags of the Portuguese pages. |
| `npm run build:pages` | Pages or locales changed | `en/*.html`, `sitemap.xml`, `robots.txt` and the SEO and footer blocks of every page. |
| `npm run build:vendor` | The `motion` version changed | `js/vendor/motion-mini.js`. |
| `scripts/make-share-images.sh` | The name or the visual changed | `og-image.png`, `og-image-en.png` and `apple-touch-icon.png`. |

If imports and pages both changed, run `modulepreload.mjs` first, because the English pages copy its
block. The Portuguese pages are the handwritten source. Tests fail if a committed page or stylesheet is not
what its generator produces.

## Tests and checks

Developed on Node 26. The file pattern in `npm test` needs Node 21 or later.

```sh
npm install                    # the build tests use the installed Tailwind
npm test                       # node --test 'tests/**/*.test.js'
UPDATE_SNAPSHOTS=1 npm test    # rewrites tests/__snapshots__/
```

`npm test` also drives headless Chrome through the `scripts/check-*.mjs` scripts and `check-step.sh` and
`check-exercises.sh`, so it needs Chrome at `/usr/bin/google-chrome`, or another path in `CHROME_BIN`. The
LaTeX compile test is skipped if `pdflatex` is not installed.

The browser checks below write screenshots at 1280px and 390px to `tmp/screens/` unless given another
folder. They start `scripts/serve.mjs` if the port is free; set `PORT` to choose one.

| Script | What it checks |
| --- | --- |
| `scripts/check-page.sh <path> [folder]` | One page: console errors, overflow at 390px and an accessibility audit. Options: `PDF=1`, `REDUCED_MOTION=1`, `BLOCK_STORAGE=1`, `MEASURE=1`, and others listed in the script. |
| `scripts/check-all.sh [folder]` | All pages, with normal motion, reduced motion and blocked localStorage, including Prove and Step by step with a proof open. |
| `scripts/check-step.sh [folder]` | Step by step in both languages: examples, a full replay, links, invalid sequents and blocked localStorage. |
| `scripts/check-exercises.sh [folder]` | Both exercise modes to the end, saved progress and reset, in both languages. |
| `scripts/check-edge.sh [folder]` | Switching language mid-play, the 404 language and blocked localStorage. |
| `scripts/check-keyboard.sh` | Real Tab navigation, visible focus, menus and sheets. |
| `scripts/lighthouse.sh [folder]` | Lighthouse on every page (minimum 95, SEO 100 on indexable pages; needs the network). A page that fails is measured twice more. Performance varies with the network, so a page near the minimum can fail on one run and pass on the next. |
| `scripts/smoke-deploy.sh [base-url]` | Routes, redirects, 404s, content types and headers with `curl`, locally or against a deployed site. |

## Structure

```
*.html, 404.html    Portuguese pages, one file per page
en/                 English pages (generated)
css/                app.css (compiled and committed); src/ is the source
js/core/            pure logic with no DOM: parser, formulas, proofs, rules, verifier, solver, hints,
                    Gentzen trees, exercises, lesson data, share links, LaTeX, routes
js/ui/              reusable DOM components, i18n.js, locales/{pt,en}.js, storage.js
js/pages/           one entry point per page
js/vendor/          bundled third-party code (generated)
tests/              node --test: core, generated files, i18n, a11y, performance, browser checks
scripts/            page generator, local server, browser checks, Lighthouse, share images
```

All the proof logic lives in `js/core/`, and the interface only draws what it returns. Every proof published
on the site goes through the verifier in the tests. The name and the public URL are single constants,
`APP_NAME` and `SITE_URL`, in `js/ui/config.js`.

More in `SPEC.md` (product specification), `CLAUDE.md` (project conventions) and `DESIGN.md` (visual
system), all in Portuguese.

## Deployment

Static deployment on Vercel with no build step. `vercel.json` sets clean URLs, redirects, caching and
security headers, and `.vercelignore` keeps everything that is not the site out of the deployment.

## License

[MIT](LICENSE) © 2026 Miguel Rocha

## Credits

Developed by **Miguel Rocha** · [miguelrocha.dev](https://miguelrocha.dev)
