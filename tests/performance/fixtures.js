// Sequentes difíceis usados nos testes de desempenho e em scripts/check-worker.mjs.

/** 3-CNF inconsistente com 10 variáveis. Com `HARD_MAX_STEPS`, a procura não acaba em tempo útil. */
export const HARD_SEQUENT = "(~c | b | ~h), (~c | f | ~h), (f | ~e | ~a), (~j | j | ~h), (~c | ~b | ~a), (~f | c | ~h), (d | h | g), (h | ~c | i), (~i | f | ~a), (~g | d | g), (e | b | b), (~h | ~h | b), (a | ~j | ~i), (j | d | g), (i | ~h | d), (e | ~f | j), (~h | ~c | c), (e | f | ~g), (e | ~a | f), (~e | f | a), (~f | h | g), (e | h | g), (e | ~a | ~a), (b | ~d | f), (i | ~h | b), (~i | j | ~a), (f | ~b | a), (c | j | g), (~f | g | i), (~f | ~a | ~h), (j | ~g | f), (~e | ~i | ~c), (g | ~c | h), (b | ~e | i), (~f | ~h | ~d), (f | ~d | ~e), (b | f | e), (~h | e | j), (~f | i | ~e), (~g | ~c | ~h), (~d | ~j | ~j), (~a | ~f | ~f), (d | ~b | ~e), (g | ~h | a), (j | ~j | ~g), (~a | ~b | d), (~b | a | ~f), (a | h | b), (a | i | c), (~g | d | ~h) |- F";

export const HARD_MAX_STEPS = 1_000_000_000;

/** Princípio do pombal, 4 pombos em 3 buracos: 12 variáveis, o máximo que a semântica aceita. */
export const PIGEONHOLE = "(a | b | c), (d | e | f), (g | h | i), (j | k | l), ~(a & d), ~(a & g), ~(a & j), ~(d & g), ~(d & j), ~(g & j), ~(b & e), ~(b & h), ~(b & k), ~(e & h), ~(e & k), ~(h & k), ~(c & f), ~(c & i), ~(c & l), ~(f & i), ~(f & l), ~(i & l) |- F";

/** Cadeia de 11 implicações ao contrário: inválida, com a tabela de verdade inteira por percorrer. */
export const LONG_INVALID = "a -> b, b -> c, c -> d, d -> e, e -> f, f -> g, g -> h, h -> i, i -> j, j -> k, k -> l |- l -> a";
