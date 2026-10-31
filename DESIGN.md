# Design

Sistema visual «Minimal claro». A fonte dos valores é o **`css/src/app.css`** (o `@theme` e o `:root` do
topo): se um valor mudar, muda o código e este documento.

## Princípios

1. **Simples e direto.** Fundo branco, neutros e tinta. A cor só aparece onde tem significado: no estado
   de uma linha da prova ou de uma mensagem. Nada decorativo que não ensine.
2. **Uma ação principal por ecrã.** Só um botão a tinta visível de cada vez. O resto é secundário,
   contorno ou ghost.
3. **A prova é a protagonista.** Fórmulas e provas em mono, com a notação habitual (¬, ∨, ∧, →, F,
   subscritos em `<sub>`, para copiar e colar dar `p11`).
4. **Cor = estado.** Cada estado tem sempre a mesma cor. **Nunca só cor:** há sempre ícone ou texto.
5. **Mobile importa.** Tudo funciona a 390px sem scroll horizontal (exceto dentro de provas muito fundas,
   da árvore e das tabelas largas, que têm scroll próprio). Alvos ≥ 44px.
6. **Didático e calmo.** Animações curtas que mostram o que mudou, nunca para decorar. Linguagem PT-PT,
   a tratar o leitor por tu.

## Tokens

Variáveis CSS do `@theme static` (também dão utilitários Tailwind, como `bg-surface` ou `text-ev-ok`).
Contrastes pela fórmula WCAG 2.1. Mínimos: **4,5:1** para texto, **3:1** para componentes e texto
≥ 24px.

### Neutros

| Token | Valor | Uso | bg | surface | surface-2 |
| --- | --- | --- | --- | --- | --- |
| `--color-bg` | `#ffffff` | Fundo da página, cartões. | — | — | — |
| `--color-surface` | `#fafafa` | Painéis sem borda. | — | — | — |
| `--color-surface-2` | `#f4f4f5` | Botão secundário, segmented, blocos mono. | — | — | — |
| `--color-hairline` | `#f0f0f2` | Divisórias discretas. | — | — | — |
| `--color-border` | `#e4e4e7` | Contorno de cartões (decorativo). | 1,27 | — | — |
| `--color-border-strong` | `#8a8a93` | Borda de campos. | 3,42 | 3,28 | 3,11 |
| `--color-text` | `#18181b` | Texto principal e fórmulas. | 17,72 | 16,97 | 16,12 |
| `--color-text-2` | `#3f3f46` | Corpo da lição. | 10,44 | 10,01 | 9,50 |
| `--color-text-muted` | `#52525b` | Texto secundário. | 7,73 | 7,41 | 7,03 |
| `--color-text-subtle` | `#71717a` | Metadados pequenos, nº de linha. **Nunca em surface-2.** | 4,83 | 4,63 | 4,40 ✗ |
| `--color-ink` | `#18181b` | O acento: botão primário, anel de foco, fundo da barra de créditos. | 17,72 | 16,97 | 16,12 |
| `--color-ink-hover` | `#27272a` | Hover do primário. | — | — | — |
| `--color-grip` | `#d4d4d8` | Pega da folha inferior. | — | — | — |

O acento é a tinta, e não uma cor: assim, um botão nunca se confunde com um estado.

### Estados

Cada cor (texto, ícone, contorno) tem um fundo suave. A cor passa 4,5:1 no branco e no seu fundo suave,
por isso o mesmo token serve para texto e para marcas. O significado dos tons ainda sem uso fica
definido quando a vista de Fitch precisar deles.

| Uso | Cor | Fundo | cor/bg | cor/fundo |
| --- | --- | --- | --- | --- |
| Certo (`.msg-ok`) | `--color-ev-ok` `#15803d` | `--color-ev-ok-soft` `#f0fdf4` | 5,02 | 4,79 |
| Erro (`.msg-error`) | `--color-ev-conflict` `#b91c1c` | `--color-ev-conflict-soft` `#fef2f2` | 6,47 | 5,91 |
| Aviso (`.msg-warn`) | `--color-ev-branch` `#b45309` | `--color-ev-branch-soft` `#fffbeb` | 5,02 | 4,84 |
| Azul, sem uso fixo | `--color-ev-unit` `#0369a1` | `--color-ev-unit-soft` `#f0f9ff` | 5,93 | 5,57 |
| Violeta, sem uso fixo | `--color-ev-back` `#6d28d9` | `--color-ev-back-soft` `#f5f3ff` | 7,10 | 6,48 |
| Magenta, sem uso fixo | `--color-ev-res` `#a21caf` | `--color-ev-res-soft` `#fdf4ff` | 6,32 | 5,89 |

As classes de estado são escritas por inteiro, porque o Tailwind só gera o que encontra escrito.

### Tipografia

Geist 400/500/600 (interface) e JetBrains Mono 400/500 (fórmulas), pedidas ao Google Fonts com
`display=swap`. **Não há mono 600 nem peso 700:** seriam sintetizados pelo browser.

| Elemento | Tamanho / altura de linha | Peso |
| --- | --- | --- |
| `h1` | 1,75rem / 1,25 | 600 |
| `h2` | 1,375rem / 1,35 | 600 |
| `h3` | 1,125rem / 1,5 | 600 |
| Corpo | 1rem / 1,6 | 400 |
| Texto da lição | 18px / 1,7 (16px no mobile) | 400 |
| Botões | 14px (13px em `sm`, 15px em `lg`) | 500 |
| Rótulos pequenos | 12px / 16px | 500 |

Tokens de peso: `--weight-regular`, `--weight-medium`, `--weight-semibold`.

### Raios, sombras e movimento

| Token | Valor |
| --- | --- |
| `--radius-xs` / `sm` / `md` / `lg` / `xl` | 6 / 8 / 10 / 12 / 16px |
| `--radius-full` | 999px |
| `--shadow-sm` | `0 1px 2px rgb(0 0 0 / 0.08)` |
| `--shadow-md` | `0 4px 16px rgb(0 0 0 / 0.08)` |
| `--shadow-lg` | `0 12px 32px rgb(0 0 0 / 0.12)` |
| `--dur-fast` / `base` / `slow` | 120 / 200 / 320ms |
| `--ease` | `cubic-bezier(0.2, 0, 0, 1)` |

Com `prefers-reduced-motion: reduce`, as durações passam a 0ms, incluindo as que o Basecoat escreve à
mão. Transições e animações usam sempre os tokens.

### Layout

| Token | Valor |
| --- | --- |
| `--content-max` | 1200px |
| `--prose-max` | 42rem |
| `--header-height` | 52px (60px a partir de 768px) |
| `--header-border` | 0 (1px a partir de 768px) |
| `--credits-bar-height` | 36px |
| `--tabbar-height` | 64px, mais `env(safe-area-inset-bottom)` |

| Largura | Layout |
| --- | --- |
| < 768px (alvo: **390px**) | Uma coluna, tab bar inferior, menus em folha. |
| ≥ 768px | Navegação no cabeçalho, menus em dropdown, duas colunas onde couber. |

## Movimento

Calmo e funcional: curto, mostra o que mudou e não decora. Nada de molas, abanões, confetes ou sons.
Tudo passa pelo `js/ui/motion.js`, o único sítio que importa o vendor (`js/vendor/motion-mini.js`, o
`animate` do `motion/mini`, gerado por `npm run build:vendor`). O vendor carrega depois do primeiro desenho,
para não pesar no arranque; até lá, uma sequência mostra só o estado final.

**Modelo.** As vistas desenham logo o estado final do passo. A sequência cria as animações todas de uma
vez, com o atraso da sua etapa e `fill: both`, que as segura no valor de partida até chegar a sua vez.
Por isso, cancelar é só largar as animações, e a página já está no estado certo.

**Tempos.** Só os tokens `--dur-*`, também no JS. O CSS minificado escreve `.12s`, por isso o `durationOf`
aceita s e ms. A sequência encolhe com a velocidade pedida.

**O que nunca anima.** Com `prefers-reduced-motion: reduce`, nada (a promessa de `sequence()` já vem
resolvida). Na impressão, nada fica escondido nem realçado. O conteúdo nunca depende da animação.

**Entre páginas.** Cross-fade de `--dur-base` com View Transitions entre documentos; a barra de créditos, o
cabeçalho e a tab bar têm `view-transition-name` para ficarem parados. O `@view-transition` vai num `<style>`
no `<head>`, antes da folha de estilos: dentro dela, ou com um script a esperar por ela, ou falhava ou
atrasava o primeiro desenho. O resto vive em `js/boot.js`, um script clássico (a CSP não deixa scripts
inline). Vindo de outra página do site, o primeiro desenho espera pelo JS, que traz o cabeçalho (o primeiro
carregamento não muda). Sem suporte no browser, a navegação é normal.

## Acessibilidade

- **Foco:** `:focus-visible { outline: 2px solid var(--color-ink); outline-offset: 2px }`; −2px nos segmented.
- **Teclado:** os menus fecham com Esc (o foco volta ao botão) e quando o Tab sai deles; as folhas são
  `<dialog>` modais, por isso prendem o foco.
- **Alvos:** ≥ 44×44px a 390px. Onde o tamanho visível é menor (`.seg`), um `::after` alarga a zona de
  toque. Exceção: links no meio de uma frase.
- **Estados** dizem-se com cor + ícone + texto; o que só se vê tem texto em `sr-only`.
- **Regiões vivas:** feedback em `role="status"` fixo, para ser anunciado.

## Navegação mobile

5 destinos (Início, Provar, Passos, Aprender, Exercícios) numa **tab bar inferior fixa**, com ícone e
rótulo; sem menu hambúrguer, para ficarem sempre a um toque. O `body` guarda a altura da tab bar, para o
rodapé nunca ficar tapado.

## Componentes

O CSS está em `css/src/app.css`, em `@layer components`. Do Basecoat vêm só a base e botão, cartão e
campos; o tema (`css/src/basecoat-vega.css`) é uma parte do original, com esses componentes.

| Componente | Classe | Anatomia |
| --- | --- | --- |
| Botão | `.btn` + `data-variant`, `data-size` | Primário a tinta; `secondary`, `outline`, `ghost`. Alturas 32/40/48px; 44px no mobile. |
| Segmented | `.seg`, `.seg.sm` | Fundo `surface-2`, opção ativa em branco com sombra; setas movem a seleção. |
| Mensagem | `.msg`, `.msg-info`… | Ícone + texto com veredito a negrito. |
| Menu | `details.dd`, `.dd-panel`, `.menu` | Dropdown a partir de 768px; folha no mobile. |
| Folha | `dialog.sheet` | Scrim a 40%, raio 20 em cima, pega, itens de 52px; arrasta para fechar. |
