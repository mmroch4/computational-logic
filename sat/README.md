# Learn Davis-Putnam SAT

A free, interactive website to learn the **Davis-Putnam (DPLL) algorithm** for the Boolean
satisfiability problem. Type a set of clauses and see whether it is satisfiable, and why, step by
step: every unit propagation, every branch and every conflict.

**Live site:** [English](https://sat.computational-logic.miguelrocha.dev/en) ·
[Português](https://sat.computational-logic.miguelrocha.dev)

The site calls the algorithm **DLL** (Davis, Logemann, Loveland), the same procedure usually known as
DPLL (Davis–Putnam–Logemann–Loveland). The original resolution-based Davis-Putnam procedure of 1960
is available too, as **DP**.

## Pages

Each page has its own URL in each language: Portuguese at the root, English under `/en`.

| Page | Portuguese | English | What it does |
| --- | --- | --- | --- |
| Home | `/` | `/en` | Introduction and a quick way into the other pages. |
| Solver | `/resolver` | `/en/solver` | Paste a clause set in any notation: result, model, DLL tree, random formula generator, LaTeX/PDF export, history and a shareable link. |
| Step by step | `/passo-a-passo` | `/en/step-by-step` | DLL (or DP) event by event: clause set, tree and pseudocode side by side, with a timeline and keyboard controls. |
| Learn | `/aprender` | `/en/learn` | A lesson with short explanations, examples, a propagation lab, animated players and a quiz. |
| Exercises | `/exercicios` | `/en/exercises` | Exercises with instant feedback. Progress stays in your browser. |

State lives in the URL (on Step by step: `?f=…&a=dll|dp&step=N&view=set|proof|tree|algo`), so any
formula or step can be shared with a link. Switching language keeps the formula, the step and the
lesson section.

## Input notations

Detected automatically:

1. Compact: `p1, -p1 -p2, p3 p2`
2. Sets: `{{p, ¬q}, {q}}` or, with clauses as disjunctions, `{p ∨ ¬q, q}`
3. Logic (CNF): `(p ∨ ¬q) ∧ q`

Negation `¬ ~ - !` · disjunction `∨ | \/ v` (`v` only as a separate token) · conjunction `∧ & /\ ^`.
Variables match `[A-Za-z][A-Za-z0-9_]*`, and a numeric suffix renders as a subscript (`p11` → p₁₁).

## Algorithm conventions

DLL follows this pseudocode:

```
DLL(S)
  S := propagate(S)
  if S is empty then return satisfiable
  if S contains F then return unsatisfiable
  l := select_literal(S)
  if DLL(S ∪ {l}) = satisfiable then return satisfiable
  else return DLL(S ∪ {l̃})
```

- Unit propagation: one literal per event, from the first unit clause in set order.
- `select_literal`: the first variable in natural alphabetical order (p2 < p11), positive branch first.
  A fixed rule, easy to follow by hand.
- A set is a set: repeated clauses and literals collapse, with a warning.
- Tautologies are flagged, not removed.
- The empty clause is shown as **F**. Truth values are T/F in English and V/F in Portuguese.

## Running locally

The site is plain static files: HTML, native ES modules and a compiled `css/app.css`, with no
framework. Running it needs Node but no `npm install`.

```sh
git clone https://github.com/mmroch4/computational-logic.git
cd computational-logic
node scripts/serve.mjs 8765      # http://localhost:8765/
```

`scripts/serve.mjs` behaves like the production host (clean URLs, the headers from `vercel.json`,
compression, the 404 page). A plain static server such as `python3 -m http.server` will not open
`/resolver` or the English pages, and opening the files with `file://` does not work, because browsers
block ES modules there.

## Building

Generated files are committed, so the host only serves files and compiles nothing. Run `npm install`
once, then the build that matches what you changed:

| Command | When | What it generates |
| --- | --- | --- |
| `npm run build:css` | Classes or `css/src/` changed | `css/app.css` (Tailwind CSS v4 and Basecoat). `npm run watch:css` rebuilds on save, without minifying. |
| `npm run build:pages` | Pages or locales changed | `en/*.html`, `sitemap.xml`, `robots.txt` and the SEO and footer blocks of every page. |
| `node scripts/modulepreload.mjs` | Imports changed | The `<link rel="modulepreload">` tags of every page. |
| `npm run build:vendor` | The `motion` version changed | `js/vendor/motion-mini.js`. |
| `scripts/make-share-images.sh` | The name or the visual changed | `og-image.png`, `og-image-en.png` and `apple-touch-icon.png`. |

The Portuguese pages are the handwritten source. Tests fail if a committed file is not what its
generator produces.

## Tests and checks

Requires Node 22 or later.

```sh
npm test                       # node --test 'tests/**/*.test.js'
UPDATE_SNAPSHOTS=1 npm test    # rewrites tests/snapshots/
```

The LaTeX compile tests are skipped if `pdflatex` is not installed.

The browser checks below use headless Chrome (`/usr/bin/google-chrome`) and write screenshots at 1280px and
390px to `tmp/screens/` unless given another folder. They start `scripts/serve.mjs` if the port is
free; set `PORT` to choose one.

| Script | What it checks |
| --- | --- |
| `scripts/check-page.sh <path> [folder]` | One page: console errors, overflow at 390px and an accessibility audit. Options: `PDF=1`, `REDUCED_MOTION=1`, `BLOCK_STORAGE=1`, `MEASURE=1`. |
| `scripts/check-all.sh [folder]` | All pages, with normal motion, reduced motion and blocked localStorage. |
| `scripts/check-resolver.sh [folder]` | The base examples, input errors, shared links and the export menu. `EN=1` runs it on the English path. |
| `scripts/check-step.sh [folder]` | Clause sets and trees of several examples. Also takes `EN=1`. |
| `scripts/check-exercises.sh [folder]` | Both exercise modes to the end, saved progress and reset. Also takes `EN=1`. |
| `scripts/check-edge.sh [folder]` | Switching language mid-play, blocked localStorage and the 404 language. |
| `scripts/check-keyboard.sh` | Real Tab navigation, visible focus, menus and sheets. |
| `scripts/lighthouse.sh [folder]` | Lighthouse on every page (minimum 95, SEO 100 on indexable pages; needs the network). |
| `scripts/smoke-deploy.sh [base-url]` | Routes, redirects, 404s, content types and headers with `curl`, locally or against a deployed site. |

## Structure

```
*.html, 404.html    Portuguese pages, one file per page
en/                 English pages (generated)
css/                app.css (compiled and committed); src/ is the source
js/core/            pure logic with no DOM: parser, clauses, propagation, DLL, DP, traces,
                    examples, exercises, generator, LaTeX, routes
js/ui/              reusable DOM components, i18n.js, locales/{pt,en}.js, storage.js
js/pages/           one entry point per page
js/vendor/          bundled third-party code (generated)
tests/              node --test: core, UI with a simulated DOM, i18n, a11y, contrast, performance
scripts/            page generator, local server, browser checks, Lighthouse, share images
```

All the algorithm logic lives in `js/core/` and produces *traces* (lists of events); the interface
only draws them. The name and the public URL are single constants, `APP_NAME` and `SITE_URL`, in
`js/ui/config.js`.

More in `CLAUDE.md` (project conventions) and `DESIGN.md` (visual system).

## Deployment

Static deployment on Vercel with no build step. `vercel.json` sets clean URLs, redirects, caching and
security headers, and `.vercelignore` keeps everything that is not the site out of the deployment.

## License

[MIT](LICENSE) © 2026 Miguel Rocha

## Credits

Developed by **Miguel Rocha** · [miguelrocha.dev](https://miguelrocha.dev)
