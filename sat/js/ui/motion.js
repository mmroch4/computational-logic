// O único sítio que importa o js/vendor/motion-mini.js. As durações vêm sempre dos tokens --dur-* do
// tema (o CSS põe-nos a 0 com movimento reduzido), e o JS das páginas nunca escreve tempos à mão.
//
// Uma sequência é uma lista de etapas que correm uma depois da outra:
//   { tweens: [{ targets, from, to, dur, offset, stagger }], gap, after }
//     targets  elementos (os que não estão desenhados, como uma tab escondida, ficam de fora);
//     from     propriedades → valor de partida; o valor de chegada é o que o CSS lhes dá;
//     to       propriedades → [partida, …, chegada], ou uma função do elemento que as devolve,
//              quando a chegada não é o estado do CSS ou o valor depende do elemento;
//     dur      "fast" | "base" | "slow" (a etapa dura o que durar o seu tween mais comprido);
//     offset   token de atraso dentro da etapa; stagger: token de atraso entre elementos;
//     gap      token de pausa antes da etapa seguinte;
//     after    corre no fim da etapa, ou ao cancelar (ex.: esconder o que acabou de sair).
//
// O DOM já está no estado final quando a sequência começa: as animações são criadas todas de uma vez,
// com o atraso de cada etapa, e o `fill: both` segura cada uma no valor de partida até chegar a sua
// vez. Por isso, cancelar é só largar as animações. Uma etapa sem elementos desenhados não gasta tempo.

// A biblioteca fica fora do arranque das páginas: carrega logo depois do primeiro desenho. Até lá,
// uma sequência mostra só o estado final.
let animate = null;
const loadVendor = () => import("../vendor/motion-mini.js").then((module) => { animate = module.animate; });
export const motionReady = new Promise((resolve) => {
  const load = () => loadVendor().then(resolve, resolve);
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(load);
  else load();
});

/** Curva do token --ease, no formato do motion (uma função de CSS não é aceite como array). */
const BEZIER = [0.2, 0, 0, 1];

// Passo de nada: a sequência de quem tem movimento reduzido, ou de quem não tem nada para mostrar.
const NOTHING = Object.freeze({ finished: Promise.resolve(), duration: 0, cancel() {} });

export function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Milissegundos de um token («fast» → --dur-fast); 0 com movimento reduzido, pelo CSS. */
export function durationOf(token) {
  if (!token) return 0;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--dur-${token}`).trim();
  const number = parseFloat(value);
  if (!Number.isFinite(number)) return 0;
  return value.endsWith("ms") ? number : number * 1000;
}

// Um elemento dentro de uma zona com display: none não tem caixas.
const isDrawn = (element) => element.isConnected && element.getClientRects().length > 0;

/** { prop: [partida, chegada] } de um tween, para um elemento. */
function keyframesOf(element, { from = {}, to = {} }) {
  const style = getComputedStyle(element);
  const keyframes = typeof to === "function" ? to(element) : { ...to };
  for (const [property, value] of Object.entries(from)) keyframes[property] = [value, style[property]];
  return keyframes;
}

/** O motion deixa o último keyframe no style: repõe o que lá estava, para as classes seguintes contarem. */
function restoreInline({ element, inline }) {
  Object.assign(element.style, inline);
}

/**
 * Corre as `etapas` umas a seguir às outras, em `speed` vezes menos tempo.
 * Devolve { finished, duration, cancel() }: `finished` é uma promessa que resolve no fim ou ao
 * cancelar (nunca rejeita); `duration` são os milissegundos da sequência; cancelar salta para o
 * estado final. Com movimento reduzido não anima nada (nem corre os `after`): a promessa já vem resolvida.
 */
export function sequence(etapas, { speed = 1 } = {}) {
  if (prefersReducedMotion()) return NOTHING;
  if (!animate) {
    etapas.forEach(({ after }) => after?.());
    return NOTHING;
  }
  const running = [];
  const pending = []; // os `after` que ainda não correram, pela ordem das etapas
  const stages = [];
  let clock = 0;

  for (const { tweens, gap, after } of etapas) {
    const started = [];
    let end = clock;
    for (const tween of tweens) {
      const start = clock + durationOf(tween.offset) / speed;
      const between = durationOf(tween.stagger) / speed;
      const duration = durationOf(tween.dur) / speed;
      [...tween.targets].filter(isDrawn).forEach((element, i) => {
        const delay = start + i * between;
        const keyframes = keyframesOf(element, tween);
        const options = { duration: duration / 1000, delay: delay / 1000, ease: BEZIER };
        const inline = Object.fromEntries(Object.keys(keyframes).map((property) => [property, element.style[property] ?? ""]));
        started.push({ controls: animate([element], keyframes, options), element, inline });
        end = Math.max(end, delay + duration);
      });
    }
    if (end > clock) end += durationOf(gap) / speed;
    clock = end;
    running.push(...started);
    if (after) pending.push(after);
    stages.push({ started, after });
  }

  if (clock === 0) {
    pending.forEach((after) => after());
    return NOTHING;
  }

  let cancelled = false;
  let settle;
  const finished = new Promise((resolve) => { settle = resolve; });
  // Cada `after` espera pelas animações da sua etapa, e não por um relógio: uma animação pausada
  // (ex.: para a fotografar a meio) segura o que vem a seguir.
  const stageEnds = stages.map(({ started, after }) =>
    Promise.all(started.map(({ controls }) => controls.finished)).then(() => {
      if (cancelled || !after) return;
      pending.splice(pending.indexOf(after), 1);
      after();
    }),
  );
  const restoreAll = () => running.forEach(restoreInline);
  Promise.all(stageEnds).then(() => {
    if (cancelled) return;
    restoreAll();
    settle();
  });

  return {
    finished,
    duration: clock,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      running.forEach(({ controls }) => controls.cancel());
      restoreAll();
      pending.splice(0).forEach((after) => after());
      settle();
    },
  };
}

/** Várias sequências ao mesmo tempo, como se fossem uma só: acabam e cancelam juntas. */
export function together(...runs) {
  return {
    finished: Promise.all(runs.map((run) => run.finished)).then(() => {}),
    duration: Math.max(...runs.map((run) => run.duration)),
    cancel: () => runs.forEach((run) => run.cancel()),
  };
}
