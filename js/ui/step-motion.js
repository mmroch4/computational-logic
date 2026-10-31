// Anima um passo do DLL: traduz as etapas de js/core/choreography.js em animações do js/ui/motion.js,
// sobre os elementos que as vistas já desenharam no estado final do passo. As vistas não sabem que
// há animação; só o estado que fica depois de as cláusulas saírem é delas (ver onSettle).
import { stepChoreography } from "../core/choreography.js";
import { prefersReducedMotion, sequence } from "./motion.js";

// Num conjunto enorme, as cláusulas saem de uma vez: animar a altura de centenas de cartões prende a
// página, e nem se distinguia cada um.
const MAX_COLLAPSING = 60;

const ENTER = { opacity: "0", transform: "translateY(4px)" };
const FUTURE = "var(--color-tree-future)";

/** A unitária pulsa: uma sombra na cor da propagação cresce e volta atrás. */
function pulseFrames(element) {
  const rest = getComputedStyle(element).boxShadow;
  const ring = "0 0 0 6px color-mix(in srgb, var(--color-ev-unit) 18%, transparent)";
  return { boxShadow: [rest, rest === "none" ? ring : `${rest}, ${ring}`, rest] };
}

/** A cláusula encolhe até não ocupar nada: o que ela guardava no `.clauses` fecha-se devagar. */
function collapseFrames(element) {
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();
  const gap = `-${getComputedStyle(element.parentElement).columnGap}`;
  const toZero = (value) => [value, "0px"];
  return {
    opacity: [style.opacity, "0"],
    width: toZero(`${box.width}px`),
    height: toZero(`${box.height}px`),
    minHeight: toZero(style.minHeight),
    paddingTop: toZero(style.paddingTop),
    paddingBottom: toZero(style.paddingBottom),
    paddingLeft: toZero(style.paddingLeft),
    paddingRight: toZero(style.paddingRight),
    borderWidth: toZero(style.borderTopWidth),
    marginRight: ["0px", gap],
    marginBottom: ["0px", gap],
  };
}

/** A aresta desenha-se do pai para o filho; a tracejada não pode usar o dashoffset e revela-se. */
function drawFrames(line) {
  if (getComputedStyle(line).strokeDasharray !== "none") {
    return { clipPath: ["inset(0 -4px 100% -4px) stroke-box", "inset(0 -4px 0 -4px) stroke-box"] };
  }
  const length = `${line.getTotalLength()}px`;
  return { strokeDasharray: [length, length], strokeDashoffset: [length, "0px"] };
}

/** Os cartões de cláusulas, pela ordem do modelo (nada se ainda não houver lista). */
const cardsIn = (root) => (root ? [...root.querySelectorAll(".clauses > li")] : []);

/** Cada etapa da coreografia em etapas do motion.js; cada uma recebe o que as vistas desenharam. */
const STAGES = {
  unit: ({ clause }, { cards }) => [{ tweens: [{ targets: [cards[clause]], to: pulseFrames, dur: "slow" }] }],

  add: ({ clause }, { cards }) => [{ tweens: [{ targets: [cards[clause]], from: ENTER, dur: "base" }] }],

  strike({ literals }, { cards }) {
    const struck = [...new Set(literals.map(({ clause }) => cards[clause]))];
    return [{
      tweens: [
        {
          targets: struck.flatMap((card) => [...card.querySelectorAll(".lit--strike")]),
          from: { backgroundSize: "0% 100%", color: "var(--color-text)" },
          dur: "base",
        },
        // A cláusula que fica em F só se pinta quando o último literal é riscado.
        {
          targets: struck.filter((card) => card.classList.contains("clause--empty")),
          from: { backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)", color: "var(--color-text)" },
          dur: "base",
        },
      ],
    }];
  },

  leave({ clauses }, { cards, clauseRoot, onSettle }) {
    const leaving = clauses.map((index) => cards[index]);
    const after = clauseRoot.querySelector(".clause-set__after");
    if (leaving.length > MAX_COLLAPSING) return [{ tweens: [], after: onSettle }];
    leaving.forEach((card) => card.classList.add("is-leaving"));
    const faded = leaving.filter((card) => card.classList.contains("gone"));
    return [
      {
        tweens: [
          {
            targets: faded,
            from: { borderStyle: "solid", borderColor: "var(--color-border)", color: "var(--color-text)" },
            dur: "fast",
          },
          {
            targets: faded.map((card) => card.querySelector(".clause__text")),
            from: { textDecorationColor: "transparent" },
            dur: "fast",
          },
          { targets: faded.map((card) => card.querySelector(".clause__tag")), from: { opacity: "0" }, dur: "fast" },
        ],
      },
      {
        tweens: [
          { targets: leaving, to: collapseFrames, dur: "base" },
          { targets: after ? [after] : [], from: { opacity: "0" }, dur: "base" },
        ],
        after: onSettle,
      },
    ];
  },

  value(_, { valuationRoot }) {
    const pill = valuationRoot?.querySelector(".val.new");
    if (!pill) return [];
    return [{
      tweens: [
        { targets: [pill], from: { backgroundColor: "var(--color-surface-2)", boxShadow: "none" }, dur: "base" },
        { targets: pill.querySelectorAll("b, .val__new"), from: { opacity: "0" }, dur: "base" },
      ],
    }];
  },

  empty: ({ clause }, { cards }) => [{ tweens: [{ targets: [cards[clause]], from: ENTER, dur: "base" }] }],

  // Os nós por visitar já lá estão, a tracejado: o traço cinzento da aresta fica por baixo até a
  // aresta nova o cobrir, e o nó espera com o aspeto de por visitar até ela lá chegar.
  node(_, { tree }) {
    if (!tree) return [];
    const { nodes, edges } = tree.changes();
    const lines = edges.map((edge) => edge.querySelector("line"));
    const ghosts = lines.map((line) => {
      const ghost = line.cloneNode();
      ghost.classList.add("tree-edge__ghost");
      line.before(ghost);
      return ghost;
    });
    const inEdges = (selector) => edges.flatMap((edge) => [...edge.querySelectorAll(selector)]);
    const inNodes = (selector) => nodes.flatMap((node) => [...node.querySelectorAll(selector)]);
    return [
      {
        tweens: [
          { targets: lines, to: drawFrames, dur: "base" },
          { targets: inEdges(".tree-edge__pill"), from: { stroke: FUTURE }, dur: "base" },
          { targets: inEdges(".tree-edge__label, .tree-edge__unit"), from: { fill: "var(--color-text-subtle)" }, dur: "base" },
        ],
        after: () => ghosts.forEach((ghost) => ghost.remove()),
      },
      {
        tweens: [
          { targets: inNodes(".tree-node__box"), from: { stroke: FUTURE, strokeDasharray: "4 3", strokeWidth: "1" }, dur: "fast" },
          { targets: inNodes(".tree-node__ring"), from: { opacity: "0" }, dur: "fast" },
        ],
      },
    ];
  },

  deadEnd(_, { tree }) {
    if (!tree) return [];
    const { faded, fadedEdges } = tree.changes();
    const targets = [
      ...faded.map((node) => node.querySelector(".tree-node__box")),
      ...fadedEdges.flatMap((edge) => [...edge.querySelectorAll("line, .tree-edge__pill")]),
    ];
    return [{ tweens: [{ targets, from: { opacity: "1" }, dur: "slow" }] }];
  },

  path(_, { tree }) {
    if (!tree) return [];
    const targets = tree.changes().pathEdges.flatMap((edge) => [...edge.querySelectorAll("line, .tree-edge__pill")]);
    return [{ tweens: [{ targets, from: { stroke: "var(--color-text-subtle)" }, dur: "slow" }] }];
  },
};

/**
 * Começa a sequência do passo `index`. `views` = { clauseRoot, onSettle, valuationRoot, tree }; só
 * o clauseRoot é obrigatório (o player da lição não tem árvore nem valoração). onSettle corre quando
 * as cláusulas acabam de sair.
 * Devolve o que o sequence() devolve: { finished, duration, cancel() }.
 */
export function playStep(trace, index, views, { speed = 1 } = {}) {
  if (prefersReducedMotion()) return sequence([]); // as etapas tocam no DOM: nem chegam a ser criadas
  const context = { ...views, cards: cardsIn(views.clauseRoot) };
  const etapas = stepChoreography(trace, index).flatMap((step) => STAGES[step.stage]?.(step, context) ?? []);
  return sequence(etapas, { speed });
}
