// Início: apresentação, a prova que se escreve sozinha e os atalhos para as 4 páginas.
import { mountHomeDemo } from "../ui/home-demo.js";
import { mountLayout } from "../ui/layout.js";

mountLayout();
mountHomeDemo(document.querySelector("[data-home-demo]"));
