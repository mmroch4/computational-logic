# Design

Sistema visual «Minimal claro». A fonte dos valores é o **`css/src/app.css`** (o `@theme` e o `:root` do
topo): se um valor mudar, muda o código e este documento. O `tests/contrast.test.js` mede os pares de cores
com esses valores. Os números `#n` remetem para «Referências (Mobbin)», no fim.

## Princípios

1. **Simples e direto.** Fundo branco, neutros e tinta. A cor só aparece onde tem significado: nos
   eventos do algoritmo. Nada decorativo que não ensine.
2. **Uma ação principal por ecrã.** Só um botão a tinta visível de cada vez: «Resolver», play,
   «Próxima pergunta». O resto é secundário, contorno ou ghost (#8, #9, #16).
3. **A fórmula é a protagonista.** Fórmulas e conjuntos em mono, com a notação habitual (¬, ∨, ∧, F,
   subscritos em `<sub>`, para copiar e colar dar `p11`).
4. **Cor = evento.** Cada evento tem sempre a mesma cor em chips, cartões, timeline, árvore e
   pseudocódigo. **Nunca só cor:** há sempre ícone ou texto (#13).
5. **Mobile importa.** Tudo funciona a 390px sem scroll horizontal (exceto dentro da árvore e das
   tabelas largas, que têm scroll próprio). Alvos ≥ 44px, verificados pelo `scripts/a11y-audit.mjs`.
6. **Didático e calmo.** Animações curtas que mostram o que mudou, nunca para decorar. Linguagem PT-PT,
   a tratar o leitor por tu.

## Tokens

Variáveis CSS do `@theme static` (também dão utilitários Tailwind, como `bg-surface` ou `text-ev-unit`).
Contrastes pela fórmula WCAG 2.1. Mínimos: **4,5:1** para texto, **3:1** para componentes e texto
≥ 24px. O `tests/contrast.test.js` recalcula-os a partir do `@theme`.

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
| `--color-ink` | `#18181b` | O acento: botão primário, play, anel de foco, fundo da barra de créditos. | 17,72 | 16,97 | 16,12 |
| `--color-ink-hover` | `#27272a` | Hover do primário. | — | — | — |
| `--color-tree-future` | `#d4d4d8` | Tracejado dos nós por visitar. | — | — | — |

O acento é a tinta, e não uma cor: assim, um botão nunca se confunde com um evento.

### Eventos

Cada evento tem a cor (texto, ícone, contorno, marca da timeline) e o fundo suave. A cor passa 4,5:1 no
branco e no seu fundo suave, por isso o mesmo token serve para texto e para marcas.

| Evento | Cor | Fundo | Classe | cor/bg | cor/fundo |
| --- | --- | --- | --- | --- | --- |
| Propagação | `--color-ev-unit` `#0369a1` | `--color-ev-unit-soft` `#f0f9ff` | `.rule-unit` | 5,93 | 5,57 |
| Ramificação | `--color-ev-branch` `#b45309` | `--color-ev-branch-soft` `#fffbeb` | `.rule-branch` | 5,02 | 4,84 |
| Conflito | `--color-ev-conflict` `#b91c1c` | `--color-ev-conflict-soft` `#fef2f2` | `.rule-conflict` | 6,47 | 5,91 |
| Satisfazível | `--color-ev-sat` `#15803d` | `--color-ev-sat-soft` `#f0fdf4` | `.rule-sat` | 5,02 | 4,79 |
| Retrocesso | `--color-ev-back` `#6d28d9` | `--color-ev-back-soft` `#f5f3ff` | `.rule-backtrack` | 7,10 | 6,48 |
| Resolução (DP) | `--color-ev-res` `#a21caf` | `--color-ev-res-soft` `#fdf4ff` | `.rule-resolution` | 6,32 | 5,89 |

Uma classe `.rule-*` define `--rule-fg` e `--rule-soft` no elemento; os componentes usam só essas duas
variáveis. As classes `.c-*` fazem o mesmo para o pseudocódigo. Os nomes das classes de evento são
variantes por inteiro, porque o Tailwind só gera o que encontra escrito.

### Tipografia

Geist 400/500/600 (interface) e JetBrains Mono 400/500 (fórmulas), pedidas ao Google Fonts com
`display=swap`. **Não há mono 600 nem peso 700:** seriam sintetizados pelo browser. O `MEASURE=1` do
`check-page.sh` compara as fontes usadas com as descarregadas.

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
mão, e o play só troca de estado. Transições e animações usam sempre os tokens (há teste).

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
| < 768px (alvo: **390px**) | Uma coluna, tab bar inferior, menus em folha, separadores no Passo a passo. |
| ≥ 768px | Navegação no cabeçalho, menus em dropdown, duas colunas onde couber. |
| ≥ 1080px | Lição com índice lateral de 240px. Por baixo disto, barra fixa do índice. |
| ≥ 1200px | Passo a passo em duas colunas: conjunto e algoritmo à esquerda, árvore à direita. |

## Movimento

Calmo e funcional: curto, mostra o que mudou e não decora. Nada de molas, abanões, confetes ou sons.
Tudo passa pelo `js/ui/motion.js`, o único sítio que importa o vendor (`js/vendor/motion-mini.js`, o
`animate` do `motion/mini`, gerado por `npm run build:vendor`). O vendor carrega depois do primeiro desenho,
para não pesar no arranque; até lá, uma sequência mostra só o estado final.

**Modelo.** As vistas desenham logo o estado final do passo. A sequência cria as animações todas de uma
vez, com o atraso da sua etapa e `fill: both`, que as segura no valor de partida até chegar a sua vez.
Por isso, cancelar é só largar as animações, e a página já está no estado certo.

**Coreografia de um passo** (`js/core/choreography.js`, puro; `js/ui/step-motion.js` traduz para o DOM). Os
passos sem uma etapa saltam-na, e uma etapa sem nada desenhado (tab escondida) não gasta tempo:

| Etapa | O que se vê | Duração |
| --- | --- | --- |
| `unit` | A cláusula unitária pulsa. | `slow` |
| `add` | A {l} da ramificação entra. | `base` |
| `strike` | O risco de l̃ entra da esquerda para a direita; a cláusula que fica em F pinta-se aqui. | `base` |
| `leave` | As satisfeitas esbatem-se (`fast`) e depois encolhem e saem, com a unitária e as repetidas (`base`). | `fast` + `base` |
| `value` | O valor novo entra na valoração, com o realce. | `base` |
| `node` | A aresta desenha-se com a pílula (`base`) e depois o nó deixa de estar a tracejado (`fast`). | `base` + `fast` |
| `empty` | O F destaca-se. | `base` |
| `deadEnd` | O ramo que acabou em F esbate-se. | `slow` |
| `path` | O caminho até «satisfazível» fica realçado. | `slow` |

O realce do pseudocódigo desliza entre linhas ao mesmo tempo (`base`).

**Tempos.** Só os tokens `--dur-*`, também no JS (há teste). O CSS minificado escreve `.12s`, por isso o
`durationOf` aceita s e ms. A sequência encolhe com a velocidade do play, e o play avança ao fim de
`PLAY_INTERVAL_MS / speed` ou da sequência, o que for maior.

**O que anima.** Só o «Seguinte» (botão ou tecla) e o play. «Anterior», saltos na timeline, cliques em nós
e `?step=N` mostram logo o estado: voltar atrás com animação baralhava a ordem causal. Qualquer interação
a meio (pausa, Anterior, timeline, nó, vista, DLL | DP) cancela a sequência. O `aria-live` sai
no início do passo.

**O que nunca anima.** Com `prefers-reduced-motion: reduce`, nada (a promessa de `sequence()` já vem
resolvida). Na impressão, nada fica escondido nem realçado: a folha põe os valores normais. A partir de 60
cláusulas a sair, elas somem de uma vez. O conteúdo nunca depende da animação: o ramo esbatido, o caminho a
verde e a resposta certa a tracejado são estado, e veem-se também com `?step=N`.

**Depois da sequência.** As cláusulas que saíram somem da lista. O passo aberto por link continua a
mostrá-las esbatidas, porque é aí que explica o que aconteceu.

**Retorno** (`js/ui/feedback-motion.js`). O ✓ ou ✗ entra com opacidade e escala (`fast`), e a explicação
sobe por baixo (`base`). As barras de progresso usam uma transição de CSS.

**Entre páginas.** Cross-fade de `--dur-base` com View Transitions entre documentos; a barra de créditos, o
cabeçalho e a tab bar têm `view-transition-name` para ficarem parados. O `@view-transition` vai num `<style>`
no `<head>`, antes da folha de estilos: dentro dela, ou com um script a esperar por ela, ou falhava ou
atrasava o primeiro desenho. O resto vive em `js/boot.js`, um script clássico (a CSP não deixa scripts inline). Vindo de outra página do site, o primeiro desenho espera pelo JS, que traz
o cabeçalho (o primeiro carregamento não muda). Sem suporte no browser, a navegação é normal.

**Lição.** As secções abaixo da dobra entram uma vez (`js/ui/lesson-reveal.js`). Quem as esconde é o JS, e só
em `@media screen`: sem JS e na impressão o conteúdo está lá.

## Acessibilidade

- **Foco:** `:focus-visible { outline: 2px solid var(--color-ink); outline-offset: 2px }`; −2px nos segmented.
- **Teclado:** `scripts/check-keyboard.sh` faz Tab a sério nas páginas PT e EN. Os menus fecham com Esc (o foco
  volta ao botão) e quando o Tab sai deles; as folhas são `<dialog>` modais, por isso prendem o foco.
- **Alvos:** ≥ 44×44px a 390px. Onde o tamanho visível é menor (`.seg`, fecho do toast), um `::after`
  alarga a zona de toque. Exceção: links no meio de uma frase.
- **Estados** dizem-se com cor + ícone + texto; o que só se vê tem texto em `sr-only`.
- **Regiões vivas:** feedback em `role="status"` fixo, para ser anunciado.

## Navegação mobile

5 destinos (Início, Resolver, Passos, Aprender, Exercícios) numa **tab bar inferior fixa**, com ícone e
rótulo; sem menu hambúrguer, para ficarem sempre a um toque (#14, #15). O `body` guarda a altura da tab
bar, para o rodapé nunca ficar tapado.

## Componentes

O CSS está em `css/src/app.css`, em `@layer components`, por ordem de página. Do Basecoat vêm só a base e
botão, cartão, campos, `kbd` e `label`; o tema (`css/src/basecoat-vega.css`) é uma parte do original,
com esses componentes.

| Componente | Classe | Anatomia |
| --- | --- | --- |
| Botão | `.btn` + `data-variant`, `data-size` | Primário a tinta; `secondary`, `outline`, `ghost`. Alturas 32/40/48px; 44px no mobile. |
| Play | `.play` | Círculo a tinta da timeline. |
| Segmented | `.seg`, `.seg.sm` | Fundo `surface-2`, opção ativa em branco com sombra; setas movem a seleção. |
| Campo | `.field`, `.input`, `.field-box` | Borda `border-strong`, 44px; erro com `aria-invalid`. |
| Chip de evento | `.chip` + `.rule-*` | Ícone + rótulo na cor do evento, sobre o fundo suave. |
| Cláusula | `.clause` | Mono; literal riscado com 2px na cor da propagação; removida a tracejado. |
| Valoração | `.val` | Nome = valor; o valor novo do passo fica realçado. |
| Mensagem | `.msg`, `.msg-info`… | Ícone + texto com veredito a negrito. O toast é uma `.msg` a flutuar. |
| Cartão | `.card` | Contorno de 1px, sem padding próprio. |
| Painel | `.panel` | `surface`, sem borda. |
| Tabela | `.tbl` | Cabeçalho discreto, linhas com hairline. |
| Pseudocódigo | `.code-panel`, `.code` | Colapsável; linha atual na cor do evento; o realce desliza entre linhas. |
| Timeline | `.tl`, `.tl-range` | Slider com marcas por evento e rótulos dos momentos-chave; fixa no mobile. |
| Árvore | `.tree-view`, `.tree-node` | Nós em curso neutros; o anel do nó atual leva a cor do evento; por visitar a tracejado; ramo em F esbatido (só caixas e linhas, o texto fica AA); caminho até satisfazível na cor do evento. |
| Menu | `details.dd`, `.dd-panel`, `.menu` | Dropdown a partir de 768px; folha no mobile. |
| Folha | `dialog.sheet` | Scrim a 40%, raio 20 em cima, pega, itens de 52px; arrasta para fechar. |
| Bloco interativo | `.lesson-figure` | `surface`, raio 20, mais largo do que o texto, com o rótulo «Interativo». |

## Impressão

`print-sheet.js` cria a `.print-sheet` no `beforeprint`: prova e árvore no DLL, sequência e pares resolvidos
no DP, sempre da resolução completa. O `@media print` esconde tudo o resto e deixa só os créditos do rodapé.

## Referências (Mobbin)

São 17 referências de interface. Cada uma indica **o que copiar**. Nenhuma é para copiar por inteiro: tiramos
padrões de interação e mantemos o visual claro e minimalista.

### Timeline / passo a passo com play (M3)

1. **Browserbase · replay de sessão**: [ecrã](https://mobbin.com/screens/0569b477-8073-491e-bdeb-372dcf2ace34)
   O que copiar: um player com barra de progresso **sincronizado com uma tabela de eventos** por baixo
   (hora · método · input · output). É o modelo da página Passo a passo: a timeline em cima e a lista
   de eventos do trace (unitária, ramificação, conflito) por baixo, com filtros em chips ("All",
   "Navigate"…) que no nosso caso passam a ser os tipos de regra.
2. **SoundCloud · mastering**: [ecrã](https://mobbin.com/screens/f4b1c3d9-a1fb-4f97-956f-c4e990789156)
   O que copiar: um stepper horizontal de passos numerados (✓ feito · número atual a escuro · cinzento
   por fazer) e uma barra de onda com marcadores. Serve para o slider de passos com **marcas
   coloridas por tipo de evento**, e o botão play redondo grande dá uma ação principal clara.

### Input de fórmula com validação inline (M2)

3. **Duolingo · formulário de pagamento**: [ecrã](https://mobbin.com/screens/9b9dd368-1cd3-40ae-8918-8401f8ea94a9)
   O que copiar: no erro, borda vermelha, ícone dentro do campo e mensagem curta **logo por baixo** do
   campo. O botão principal fica desativado enquanto há erro. É o padrão para erros do parser
   ("carácter inesperado na posição 7").
4. **Square · erro de campo + toast**: [ecrã](https://mobbin.com/screens/2d04b11c-f3d4-4937-a056-1e1898bec97d)
   O que copiar: uma linha de erro com ícone ⓘ e texto vermelho pequeno, mais um toast de erro global
   no fundo do ecrã com botão fechar. Uma caixa de nota cinzenta com ícone serve para avisos não
   bloqueantes (cláusulas repetidas colapsadas).
5. **Base44 · editor de código**: [ecrã](https://mobbin.com/screens/169c4be2-9e1d-49b6-9e0c-4f560ce4fdd3)
   O que copiar: tipografia mono com números de linha discretos e fundo branco, sem tema escuro.
   Serve para o painel de **pseudocódigo DLL** com a linha atual destacada (M3.2).
6. **Base44 · documentação API**: [ecrã](https://mobbin.com/screens/67828c1b-90e1-4e8d-89a1-9e6f6cec99b4)
   O que copiar: secções em cartões com título + ação "Copiar" à direita e blocos de código com botão
   copiar. Serve para os blocos de exportação (LaTeX, link) do M4.

### Árvore / grafo (M3.4)

7. **incident.io · Catalog Graph**: [ecrã](https://mobbin.com/screens/dd113951-467e-44d1-bad2-af3c90dda93e)
   O que copiar: nós como **cartões retangulares com rótulo pequeno em cima** (tipo) e valor em baixo,
   arestas finas cinzentas com uma etiqueta numa "pílula" a meio, fundo pontilhado subtil e controlos
   +/−/ajustar no canto. É o modelo para a árvore de decisões: nó = conjunto S, etiqueta da aresta =
   literal escolhido.

### Páginas de aprendizagem (M5)

8. **Brilliant · landing "Learn by doing"**: [ecrã](https://mobbin.com/screens/fa106126-e261-4f12-8bdd-164e1872d30d)
   O que copiar: um hero com título grande, uma frase de apoio, duas ações (primária cheia + secundária
   contornada) e categorias numa faixa por baixo. Base para o hero do `index.html` com os 3 cartões
   (Resolver / Passo a passo / Aprender). A fórmula rápida entra no lugar dos botões.
9. **Brilliant · home com lição recomendada**: [ecrã](https://mobbin.com/screens/feb81e8d-d2f4-495e-b324-8a98c1a26129)
   O que copiar: **um cartão central com uma só ação** ("Start") e progresso discreto à volta. Aplica-se
   à página Exercícios: o próximo exercício em destaque e a lista por baixo.
10. **Codecademy · lição com painel lateral (fluxo "Completing a quiz")**: [fluxo](https://mobbin.com/flows/b192900c-261e-4393-be74-b1926ffd8abf)
    O que copiar: o índice da lição à esquerda com ✓ nos tópicos vistos, o conteúdo no centro e
    "Back / Next" + "1/10" no rodapé. O resumo do quiz mostra "12 corretas · 4 erradas" com ícones e
    a revisão "a tua resposta" vs "resposta correta" em caixas com borda vermelha/verde. Modelo
    para a página Aprender (secções) e para a revisão dos exercícios (M6).

### Feedback de quiz certo/errado (M5/M6)

11. **Brilliant · faixa "Correct!"**: [ecrã](https://mobbin.com/screens/f7c37d37-b3d9-48a8-b85c-c6bae20db24b)
    O que copiar: depois de responder aparece uma **faixa fixa no fundo** (verde = certo) com ícone,
    "Correct!", um botão secundário "Why?" e o primário "Continue". Copiamos a estrutura: veredito +
    "Porquê?" (explicação com a regra do DLL) + "Continuar".
12. **Duolingo · fluxo "Completing a lesson"**: [fluxo](https://mobbin.com/flows/d27dcac0-e266-49cc-8133-abbf05fb5b74)
    O que copiar: o ecrã de conclusão com dois cartões de métricas (total · precisão %) e as ações
    "Rever lição" (secundária) + "Continuar" (primária). Usamos uma versão sóbria, sem mascotes:
    "Resolveste 7/10 · 2 dicas usadas".

### Cartões de resultado / estado (M2.3)

13. **Square · revisão com caixas de estado**: [ecrã](https://mobbin.com/screens/fd16b917-b38a-4707-ae9c-8f21fc0c2817)
    O que copiar: uma caixa de sucesso verde-clara com ícone ✓ e texto escuro, uma caixa informativa
    cinzenta com ⓘ e uma lista de itens com ✓ e chevron. Modelo do cartão "Satisfazível" (verde) /
    "Insatisfazível" (vermelho) **com ícone e texto, nunca só cor**, seguido da valoração em lista.

### Navegação mobile com tabs (M0.7)

14. **Brilliant iOS · tab bar flutuante**: [ecrã](https://mobbin.com/screens/9ae00b56-ed93-44fc-9d1f-0e608ce6e78d)
    O que copiar: 3 tabs com ícone + rótulo e o item ativo num fundo arredondado. Alternativa
    considerada para o mobile.
15. **Insight Timer iOS · tab bar clássica**: [ecrã](https://mobbin.com/screens/d92804fa-1917-4c56-a628-74211598327c)
    O que copiar: uma tab bar inferior simples com 4 ícones + rótulo, ativo a preto e inativos a cinzento,
    e chips de filtro ("In Progress / Completed / Saved") que servem para filtrar exercícios.
    Com 5 destinos, a escolha final (tab bar inferior) está em "Navegação mobile (decisão)".

### Hero com input e rodapé (M0.8)

16. **Relume · hero com caixa de texto**: [secção](https://mobbin.com/sites/sections/ffbfefca-e3e6-4805-89d1-3a1552c04de0)
    O que copiar: título de 2 linhas, subtítulo, uma **caixa de input grande como ação principal** com
    o botão dentro, à direita, e o link "Try an example" por baixo. É exatamente a "fórmula rápida"
    da home ("experimenta um exemplo").
17. **Faculty Department · rodapé minimal**: [secção](https://mobbin.com/sites/sections/61c49280-bcb2-4ddc-b79d-63883c3a5d18)
    O que copiar: rodapé de uma linha, texto pequeno a cinzento, nome à esquerda e links à direita.
    Formato para "Desenvolvido por Miguel Rocha · miguelrocha.dev".

### Notas da pesquisa

- Pesquisa feita com o Mobbin MCP (screens web/iOS, flows e sections) a 2026-10-29.
- Não houve resultados úteis para "onboarding" específico de ferramentas de lógica. O padrão do hero
  da Brilliant (#8) e da Relume (#16) cobre a primeira visita: uma frase, uma ação e um exemplo clicável.
- Descartados: players de vídeo escuros (Higgsfield, Voicenotes), grafos radiais (Higgsfield memory),
  porque são decorativos e pouco legíveis para alunos.
