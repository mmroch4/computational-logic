// Índice da lição (página Aprender): lista das secções com scroll-spy e progresso da leitura.
//
// As secções vivem no HTML (<section class="lesson-section" id="…"> com um <h2>), para a lição se ler
// mesmo sem JS. Este módulo só constrói o índice a partir delas e marca a secção que se está a ler.
// Um só <details>: a partir de 1080px fica sempre aberto e é a coluna lateral; abaixo disso, o resumo
// é a barra fixa «3/7 · título», que abre o painel do índice numa folha.
//
// renderLessonToc, activeSectionIndex e readingProgress são puras (testadas em node);
// mountLessonToc é a única parte que mexe no DOM.
import { t } from "./i18n.js";
import { openSheet } from "./sheet.js";
import { escapeHtml } from "./layout.js";

const CHECK_ICON =
  '<svg class="ic lesson-toc__check" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const CHEVRON_ICON =
  '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>';

function itemHtml(section, index, active) {
  const state = index < active ? "done" : index === active ? "current" : "todo";
  const aria = index === active ? ' aria-current="location"' : "";
  const mark =
    state === "done"
      ? `${CHECK_ICON}<span class="sr-only">(${escapeHtml(t("learn.toc.done"))}) </span>`
      : `<span class="lesson-toc__num">${escapeHtml(section.number)}</span>`;
  const tag =
    state === "todo"
      ? ""
      : `<span class="lesson-toc__state" aria-hidden="true">${escapeHtml(t(state === "done" ? "learn.toc.read" : "learn.toc.reading"))}</span>`;
  return (
    `<li class="lesson-toc__item lesson-toc__item--${state}">` +
    `<a class="lesson-toc__link" href="#${escapeHtml(section.id)}" data-toc-index="${index}"${aria}>` +
    `${mark}<span class="lesson-toc__title">${escapeHtml(section.title)}</span>${tag}</a></li>`
  );
}

// sections: [{ id, number, title }] pela ordem da página. active: índice da secção atual.
// progress: fração lida (0 a 1). As secções antes da atual levam ✓ ("já lida").
export function renderLessonToc(sections, active = 0, { progress = 0 } = {}) {
  const current = sections[active];
  const title = escapeHtml(t("learn.toc.title"));
  const position = current
    ? `<span class="lesson-toc__position">${active + 1}/${sections.length}</span>` +
      `<span class="lesson-toc__current">${escapeHtml(current.title)}</span>`
    : "";
  const count = t("learn.toc.count", { n: active, total: sections.length });
  return (
    '<details class="lesson-toc__details">' +
    `<summary class="lesson-toc__summary" aria-haspopup="dialog"><span class="sr-only">${title}: </span>${position}${CHEVRON_ICON}` +
    `<span class="lesson-toc__line" aria-hidden="true"></span></summary>` +
    `<div class="lesson-toc__panel">` +
    `<p class="lesson-toc__heading" aria-hidden="true">${title}</p>` +
    `<div class="lesson-toc__meter">` +
    `<div class="lesson-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress * 100)}" ` +
    `aria-label="${escapeHtml(t("learn.progressLabel"))}"><div class="lesson-progress__bar"></div></div>` +
    `<span class="lesson-toc__count">${escapeHtml(count)}</span></div>` +
    `<ol class="lesson-toc__list list-none">${sections.map((section, index) => itemHtml(section, index, active)).join("")}</ol>` +
    `</div></details>`
  );
}

// Secção atual: a última cujo topo já passou a linha de leitura (offset, em px desde o topo do ecrã).
// tops: posição de cada secção relativa ao ecrã (getBoundingClientRect().top). No fim da página
// (atBottom) a última secção fica ativa, mesmo que seja curta e nunca chegue à linha.
export function activeSectionIndex(tops, offset, { atBottom = false } = {}) {
  if (tops.length === 0) return 0;
  if (atBottom) return tops.length - 1;
  let active = 0;
  tops.forEach((top, index) => {
    if (top <= offset) active = index;
  });
  return active;
}

// Fração lida (0 a 1). Se a página cabe toda no ecrã, já está toda à vista: 1.
export function readingProgress({ scrollY, scrollHeight, viewportHeight }) {
  const scrollable = scrollHeight - viewportHeight;
  if (scrollable <= 0) return 1;
  return Math.min(1, Math.max(0, scrollY / scrollable));
}

// Liga o índice à página. Devolve { refresh } para voltar a desenhar (ex.: depois de mudar de idioma).
export function mountLessonToc({
  tocEl = document.getElementById("lesson-toc"),
  sectionEls = [...document.querySelectorAll(".lesson-section")],
} = {}) {
  const desktop = window.matchMedia("(min-width: 1080px)");
  let active = 0;
  let progress = 0;
  let closeSheet = null; // abaixo dos 1080px, o índice abre numa folha

  const sectionsData = () =>
    sectionEls.map((el, index) => ({
      id: el.id,
      number: String(index + 1),
      title: el.querySelector("[data-section-title]")?.textContent ?? el.id,
    }));

  // Altura do header fixo: as secções e o índice ficam por baixo dele (e da barra do índice).
  function stickyTop() {
    return document.querySelector(".hdr")?.offsetHeight ?? 0;
  }

  function render() {
    if (closeSheet) return; // a folha faz parte do índice: redesenhá-lo agora fechava-a
    // O redesenho troca os nós: quem tinha o foco (a barra ou uma secção) tem de o recuperar.
    const focused = tocEl.contains(document.activeElement) ? document.activeElement : null;
    const index = focused?.dataset.tocIndex;
    tocEl.innerHTML = renderLessonToc(sectionsData(), active, { progress });
    tocEl.querySelector("details").open = desktop.matches;
    if (focused) {
      const selector = index === undefined ? "summary" : `[data-toc-index="${index}"]`;
      tocEl.querySelector(selector).focus({ preventScroll: true });
    }
  }

  // Escolher uma secção fecha a folha, para mostrar o texto.
  tocEl.addEventListener("click", (event) => {
    if (desktop.matches) return;
    if (event.target.closest("summary")) {
      event.preventDefault();
      const details = tocEl.querySelector("details");
      details.open = true;
      closeSheet = openSheet(details.querySelector(".lesson-toc__panel"), {
        title: t("learn.toc.title"),
        onClose() {
          closeSheet = null;
          details.open = false;
          render();
        },
      });
    } else if (event.target.closest("[data-toc-index]")) {
      closeSheet?.();
    }
  });

  function update() {
    const top = stickyTop();
    // Abaixo dos 1080px, a barra do índice também tapa o topo do texto.
    const tocHeight = desktop.matches ? 0 : (tocEl.querySelector("summary")?.offsetHeight ?? 0);
    const scrollOffset = top + tocHeight + 16;

    const { scrollY, innerHeight } = window;
    const { scrollHeight } = document.documentElement;
    const atBottom = scrollY + innerHeight >= scrollHeight - 2 && scrollY > 0;
    progress = readingProgress({ scrollY, scrollHeight, viewportHeight: innerHeight });
    // Linha de leitura: logo abaixo do que fica tapado no topo. Assim, ao escolher uma secção no
    // índice (o salto pára em --lesson-scroll-offset), é essa que fica ativa.
    const line = scrollOffset + 24;
    const next = activeSectionIndex(
      sectionEls.map((el) => el.getBoundingClientRect().top),
      line,
      { atBottom }
    );
    if (next !== active) {
      active = next;
      render();
      // A barra de endereço acompanha a leitura: é assim que a troca de idioma volta à mesma secção.
      history.replaceState(null, "", `#${sectionEls[active].id}`);
    }
    // As duas barras (a do painel e a linha da barra fixa) leem a mesma variável.
    tocEl.style.setProperty("--lesson-progress", String(progress));
    tocEl.querySelector('[role="progressbar"]')?.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
  }

  let scheduled = false;
  function onScroll() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      update();
    });
  }

  render();
  update();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  desktop.addEventListener("change", () => {
    render();
    update();
  });

  return {
    refresh() {
      render();
      update();
    },
  };
}
