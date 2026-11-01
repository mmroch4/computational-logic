// Corre antes do primeiro desenho, em todas as páginas. É um ficheiro, e não um script no <head>,
// porque a Content-Security-Policy do vercel.json só deixa correr scripts do próprio site.
(() => {
  // Fontes sem bloquear o primeiro desenho: uma folha acrescentada por script não bloqueia, e usa o
  // pedido já feito pelo preload. Sem JS, vale o <noscript> do <head>.
  const fonts = document.querySelector('link[rel="preload"][as="style"]');
  if (fonts) {
    const sheet = document.createElement("link");
    sheet.rel = "stylesheet";
    sheet.href = fonts.href;
    document.head.append(sheet);
  }

  // Vindo de outra página do site, o primeiro desenho espera pelo JS da página, que traz o cabeçalho.
  if (window.navigation?.activation?.from && navigation.activation.navigationType !== "reload") {
    const entry = document.createElement("script");
    entry.type = "module";
    entry.src = document.currentScript.dataset.entry;
    entry.setAttribute("blocking", "render");
    document.head.append(entry);
  }

  // Se mesmo assim o cabeçalho não chegou, não há transição: o cabeçalho piscava.
  addEventListener("pagereveal", (e) => {
    if (e.viewTransition && !document.querySelector(".hdr")) e.viewTransition.skipTransition();
  });
})();
