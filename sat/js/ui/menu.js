/**
 * Menus e painéis que abrem de um botão: `<details class="dd">` com o <summary> e um `.dd-panel`.
 * A partir de 768px o painel abre por baixo do botão; abaixo disso, o mesmo painel abre numa folha.
 * No painel `.menu`, ↑/↓, Home e End andam pelos itens, e o Tab continua a passar por todos.
 * Fecham com Esc (o foco volta ao botão), ao clicar fora e quando o Tab sai deles (na folha, o foco
 * fica preso e isso não acontece). Os eventos ficam no contentor, que pode
 * redesenhar os menus à vontade; o título da folha vem de `data-sheet-title`.
 */
import { openSheet } from "./sheet.js";

/** O mesmo limite do CSS: abaixo dele, os menus abrem como folha. */
export const MOBILE_QUERY = "(max-width: 767.98px)";

const closers = new WeakMap(); // <details> → a função que fecha a folha dele

/**
 * Índice do item que recebe o foco com a tecla `key` (↑/↓ dão a volta; Home/End), numa lista de
 * `length` itens em que o foco está em `index` (-1 = fora da lista, por exemplo no botão do menu).
 * Devolve null para as outras teclas.
 */
export function menuKeyTarget(length, index, key) {
  if (length === 0) return null;
  switch (key) {
    case "ArrowDown":
      return index < 0 ? 0 : (index + 1) % length;
    case "ArrowUp":
      return index < 0 ? length - 1 : (index - 1 + length) % length;
    case "Home":
      return 0;
    case "End":
      return length - 1;
    default:
      return null;
  }
}

const panelOf = (details) => details.querySelector(".dd-panel");
const itemsOf = (panel) =>
  [...panel.querySelectorAll('button:not([aria-disabled="true"]), a[href]')].filter((item) => !item.closest("[hidden]"));

/** Abre o menu; com `focusFirst`, o foco passa para o primeiro item (abertura pelo teclado). */
export function openMenu(details, { focusFirst = false, onOpen } = {}) {
  const panel = panelOf(details);
  details.open = true;
  if (window.matchMedia(MOBILE_QUERY).matches) {
    closers.set(details, openSheet(panel, {
      title: details.dataset.sheetTitle ?? details.querySelector("summary").textContent.trim(),
      onClose() {
        closers.delete(details);
        details.open = false;
      },
    }));
  }
  onOpen?.(details);
  if (focusFirst && panel.matches(".menu")) itemsOf(panel)[0]?.focus();
}

export function closeMenu(details, { focus = false } = {}) {
  closers.get(details)?.();
  details.open = false;
  if (focus) details.querySelector("summary").focus();
}

/**
 * Liga os menus `details.dd` de `container` (os que já lá estão e os que forem desenhados depois).
 * `onOpen(details)` corre ao abrir, antes de o foco passar para o primeiro item.
 */
export function mountMenus(container, { onOpen } = {}) {
  container.addEventListener("click", (event) => {
    const summary = event.target.closest("details.dd > summary");
    if (!summary) return;
    event.preventDefault();
    const details = summary.parentElement;
    if (details.open) closeMenu(details);
    else openMenu(details, { focusFirst: event.detail === 0, onOpen }); // detail 0 = Enter ou Espaço
  });

  container.addEventListener("keydown", (event) => {
    const details = event.target.closest("details.dd");
    if (!details) return;
    const handled = () => {
      event.preventDefault();
      event.stopPropagation(); // Home/End não chegam à timeline
    };
    if (!details.open) {
      if (event.key === "ArrowDown" && event.target.matches("summary")) {
        handled();
        openMenu(details, { focusFirst: true, onOpen });
      }
      return;
    }
    if (event.key === "Escape") {
      handled();
      closeMenu(details, { focus: true });
      return;
    }
    const panel = panelOf(details);
    if (!panel.matches(".menu")) return;
    // Num campo de pesquisa, Home e End andam pelo texto.
    if (event.target.matches("input") && (event.key === "Home" || event.key === "End")) return;
    const items = itemsOf(panel);
    const target = menuKeyTarget(items.length, items.indexOf(document.activeElement), event.key);
    if (target === null) return;
    handled();
    items[target].focus();
  });

  // Sem relatedTarget, o foco saiu da janela ou caiu num sítio não focável: fica a cargo do clique fora.
  container.addEventListener("focusout", (event) => {
    const details = event.target.closest("details.dd[open]");
    if (details && event.relatedTarget && !details.contains(event.relatedTarget)) closeMenu(details);
  });

  // composedPath() e não contains(): quem trata o clique pode já ter redesenhado o painel.
  document.addEventListener("click", (event) => {
    const path = event.composedPath();
    container.querySelectorAll("details.dd[open]").forEach((details) => {
      if (!path.includes(details)) closeMenu(details);
    });
  });
}

/** Liga os menus de `container`: escolher uma ação fecha o menu e o foco volta ao botão. */
export function mountBarMenus(container) {
  mountMenus(container);
  container.addEventListener("click", (event) => {
    if (event.target.closest(".dd-panel [data-action]")) {
      closeMenu(event.target.closest("details"), { focus: true });
    }
  });
}
