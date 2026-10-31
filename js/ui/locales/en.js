// English. Must have exactly the same keys as pt.js (checked by tests/i18n.test.js).
export default {
  meta: {
    langName: "English",
    ogImageAlt: "Learn Natural Deduction: Fitch-style proofs, checked line by line.",
    home: {
      title: "Learn natural deduction",
      description: "Learn to write natural deduction proofs in Fitch notation, with every line checked, strategy hints and step-by-step solutions.",
    },
    prove: {
      title: "Natural deduction proof checker",
      description: "Enter a sequent and build the proof in Fitch notation: every line is checked, with hints, automatic solutions and counterexamples.",
    },
    step: {
      title: "Natural deduction step by step",
      description: "Follow a natural deduction proof step by step, in Fitch notation, with the strategy that explains each line up to the conclusion.",
    },
    learn: {
      title: "Natural deduction explained",
      description: "An interactive natural deduction lesson: introduction and elimination rules, subproofs, derived rules and proof strategies.",
      level: "Beginner",
      teaches: "Introduction and elimination rules · Subproofs · Derived rules · Proof strategies",
    },
    exercises: {
      title: "Natural deduction exercises",
      description: "Practise natural deduction with graded exercises: write the proofs in Fitch notation, with instant feedback and saved progress.",
    },
    notFound: {
      title: "Page not found",
      description: "This page does not exist. Go back to the start of the natural deduction tool.",
    },
  },
  nav: {
    label: "Main navigation",
    home: "Home",
    prove: "Prove",
    step: "Step by step",
    stepShort: "Steps",
    learn: "Learn",
    exercises: "Exercises",
  },
  header: {
    homeLink: "{app}: home page",
    langLabel: "Language",
  },
  creditsBar: {
    text: "Platform created by {name}",
    github: "{name} on GitHub",
  },
  footer: {
    credit: "Developed by {name}",
    repo: "Source on GitHub",
    pagesLabel: "Pages",
  },
  layout: {
    skipToContent: "Skip to content",
  },
  sheet: {
    close: "Close",
  },
  emptyState: {
    heading: "Still under construction",
  },
  home: {
    title: "Learn natural deduction, line by line",
    lead: "Write proofs in Fitch notation and see every line checked, with its rule and the lines it cites.",
    empty: "The tool is being built. Soon you will start your first proof here.",
  },
  prove: {
    title: "Prove in natural deduction",
    lead: "Enter a sequent and build the proof in Fitch notation, with every line checked.",
    empty: "The proof editor is not available on this page yet.",
  },
  step: {
    title: "Natural deduction step by step",
    lead: "Follow a proof from start to finish, with the strategy that explains each line.",
    empty: "Proof playback is not available on this page yet.",
  },
  learn: {
    title: "Learn natural deduction",
    lead: "A lesson on the rules, subproofs and the strategies for finding a proof.",
    empty: "The lesson is not available on this page yet.",
  },
  exercises: {
    title: "Natural deduction exercises",
    lead: "Graded proofs, with instant feedback and your progress saved.",
    empty: "The exercises are not available on this page yet.",
  },
  notFound: {
    title: "This page does not exist",
    text: "Like a line citing another out of its reach: you cannot get anywhere from here. Go back and take another path.",
    back: "Go to the home page",
    prove: "Write a proof",
  },
  parser: {
    errors: {
      emptyInput: "Write a formula.",
      tooLong: "The formula has {length} characters not counting spaces, and the maximum is {max}.",
      unexpectedChar: "The symbol “{char}” is not part of the notation.",
      badVariable: "“{token}” is not a variable: names start with a letter (e.g. p, q1, x_2).",
      unbalanced: "“{char}” has no match: check the parentheses.",
      missingOperand: "A formula is missing next to “{char}”.",
      missingOperator: "A connective is missing before “{token}”.",
      missingTurnstile: "The ⊢ symbol is missing between the premises and the conclusion.",
      multipleTurnstiles: "A sequent has a single ⊢, so this “{token}” is one too many.",
      multipleConclusions: "A sequent has a single conclusion: the comma after ⊢ should not be there.",
      emptyPremise: "A premise is missing next to this comma.",
      missingConclusion: "The conclusion is missing after “{token}”.",
    },
  },
  semantics: {
    errors: {
      tooManyVariables: "There are {count} variables, and the truth table only takes up to {max}.",
    },
  },
  proof: {
    errors: {
      noSuchLine: "Line {line} does not exist.",
      invalidLine: "Line {line} is malformed.",
      invalidDepth: "Line {line} cannot sit at this depth.",
      misplacedPremise: "Line {line} is a premise: premises go at the start of the proof, outside subproofs.",
      capturesLines: "A hypothesis at line {line} would capture the lines below it: close the subproof first.",
      notInSubproof: "Line {line} is not inside a subproof.",
      alreadyClosed: "The subproof of line {line} is already closed.",
    },
  },
  verify: {
    errors: {
      noSuchLine: "Line {line} does not exist.",
      emptyFormula: "Line {line} still needs a formula.",
      missingRule: "Line {line} still needs a rule.",
      unknownRule: "Line {line}: there is no rule called “{rule}”.",
      noSuchCitation: "Line {line}: citation {cited} points to a line that does not exist.",
      inaccessibleLine: "Line {line}: you cannot cite {cited} from here, because it is not accessible.",
      openSubproof: "Line {line}: subproof {cited} is still open, so close it before citing it.",
      notASubproof: "Line {line}: range {cited} is not a complete subproof.",
      emptyCitation: "Line {line}: citation {cited} depends on a line with no formula yet.",
      missingCitation: "Line {line}: rule {rule} cites {expected}, and you gave only {found}.",
      extraCitation: "Line {line}: rule {rule} cites {expected}, and you gave {found}.",
      wrongCitationKind: "Line {line}: rule {rule} cites lines and subproofs differently, so check the citations.",
      ruleNotApplicable: "Line {line}: what you cited does not have the form rule {rule} asks for.",
      formulaMismatch: "Line {line}: rule {rule} applies to what you cited, but it does not give this formula.",
    },
  },
};
