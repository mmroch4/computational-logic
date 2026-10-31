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
};
