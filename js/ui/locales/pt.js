// Português de Portugal (PT-PT). Trata o leitor por tu, com a terminologia habitual da dedução natural.
// Valores: texto com {parâmetros}, ou funções (params) => texto para plurais.
export default {
  meta: {
    langName: "Português",
    ogImageAlt: "Learn Natural Deduction: provas em notação de Fitch, verificadas linha a linha.",
    home: {
      title: "Aprender dedução natural",
      description: "Aprende a fazer provas de dedução natural em notação de Fitch, com verificação de cada linha, dicas e soluções passo a passo.",
    },
    prove: {
      title: "Provar em dedução natural online",
      description: "Escreve um sequente e faz a prova em notação de Fitch: cada linha é verificada, e tens dicas, solução automática e contraexemplos.",
    },
    step: {
      title: "Dedução natural passo a passo",
      description: "Acompanha uma prova de dedução natural passo a passo, em notação de Fitch, com a estratégia que explica cada linha até à conclusão.",
    },
    learn: {
      title: "Dedução natural explicada",
      description: "Lição interativa de dedução natural: regras de introdução e eliminação, subdeduções, regras derivadas e estratégias de prova.",
      level: "Iniciante",
      teaches: "Regras de introdução e eliminação · Subdeduções · Regras derivadas · Estratégias de prova",
    },
    exercises: {
      title: "Exercícios de dedução natural",
      description: "Treina dedução natural com exercícios graduados: faz as provas em notação de Fitch, com correção imediata e progresso guardado.",
    },
    notFound: {
      title: "Página não encontrada",
      description: "Esta página não existe. Volta ao início da ferramenta de dedução natural.",
    },
  },
  nav: {
    label: "Navegação principal",
    home: "Início",
    prove: "Provar",
    step: "Passo a passo",
    stepShort: "Passos",
    learn: "Aprender",
    exercises: "Exercícios",
  },
  header: {
    homeLink: "{app}: página inicial",
    langLabel: "Idioma",
  },
  creditsBar: {
    text: "Plataforma criada por {name}",
    github: "{name} no GitHub",
  },
  footer: {
    credit: "Desenvolvido por {name}",
    repo: "Código no GitHub",
    pagesLabel: "Páginas",
  },
  layout: {
    skipToContent: "Saltar para o conteúdo",
  },
  sheet: {
    close: "Fechar",
  },
  emptyState: {
    heading: "Ainda em construção",
  },
  home: {
    title: "Aprende dedução natural, linha a linha",
    lead: "Faz provas em notação de Fitch e vê cada linha verificada, com a regra e as linhas que ela cita.",
    empty: "A ferramenta está a ser construída. Em breve começas aqui a tua primeira prova.",
  },
  prove: {
    title: "Provar em dedução natural",
    lead: "Escreve um sequente e constrói a prova em notação de Fitch, com cada linha verificada.",
    empty: "O editor de provas ainda não está disponível nesta página.",
  },
  step: {
    title: "Dedução natural passo a passo",
    lead: "Acompanha uma prova do início ao fim, com a estratégia que explica cada linha.",
    empty: "A reprodução de provas ainda não está disponível nesta página.",
  },
  learn: {
    title: "Aprender dedução natural",
    lead: "Uma lição sobre as regras, as subdeduções e as estratégias para encontrar uma prova.",
    empty: "A lição ainda não está disponível nesta página.",
  },
  exercises: {
    title: "Exercícios de dedução natural",
    lead: "Provas graduadas, com correção imediata e o teu progresso guardado.",
    empty: "Os exercícios ainda não estão disponíveis nesta página.",
  },
  notFound: {
    title: "Esta página não existe",
    text: "Como uma linha que cita outra fora do seu alcance: daqui não se chega a lado nenhum. Volta atrás e segue outro caminho.",
    back: "Ir para o início",
    prove: "Fazer uma prova",
  },
  parser: {
    errors: {
      emptyInput: "Escreve uma fórmula.",
      tooLong: "A fórmula tem {length} caracteres sem contar os espaços, e o máximo é {max}.",
      unexpectedChar: "O símbolo «{char}» não faz parte da notação.",
      badVariable: "«{token}» não é uma variável: os nomes começam por uma letra (ex.: p, q1, x_2).",
      unbalanced: "«{char}» não tem par: confirma os parênteses.",
      missingOperand: "Falta uma fórmula junto de «{char}».",
      missingOperator: "Falta um conectivo antes de «{token}».",
      missingTurnstile: "Falta o símbolo ⊢ entre as premissas e a conclusão.",
      multipleTurnstiles: "Um sequente só tem um ⊢, e este «{token}» está a mais.",
      multipleConclusions: "Um sequente só tem uma conclusão: a vírgula depois do ⊢ está a mais.",
      emptyPremise: "Falta uma premissa junto desta vírgula.",
      missingConclusion: "Falta a conclusão depois de «{token}».",
    },
  },
  semantics: {
    errors: {
      tooManyVariables: "Há {count} variáveis, e a tabela de verdade só aceita até {max}.",
    },
  },
  proof: {
    errors: {
      noSuchLine: "A linha {line} não existe.",
      invalidLine: "A linha {line} está mal formada.",
      invalidDepth: "A linha {line} não pode ficar a esta profundidade.",
      misplacedPremise: "A linha {line} é uma premissa: as premissas ficam no início da prova, fora das subdeduções.",
      capturesLines: "Uma hipótese na linha {line} ia apanhar as linhas seguintes: fecha primeiro a subdedução.",
      notInSubproof: "A linha {line} não está dentro de uma subdedução.",
      alreadyClosed: "A subdedução da linha {line} já está fechada.",
    },
  },
};
