import { CENTURY, ONE_YEAR } from "./estimator";
import type { Challenge } from "./engine";

// Password Forge: six short challenges at the fictional Halden Works locksmith's forge.
// Fictional; pending SME review (docs/design/PASSWORD_FORGE.md). Every password shown here is
// made up for the game. Learners are told never to type a real password.

export const ORG = "Halden Works";

export const CHALLENGES: readonly Challenge[] = [
  {
    id: "first-forge",
    kind: "build",
    guided: true,
    title: "Your first forge",
    lesson: "Watch the cracker panel as you type. It guesses the way real attackers do: common passwords first, then words, swaps, patterns, and only then raw combinations.",
    brief: "Someone set the forge's admin password to “sunshine”. Rework it until the offline smart cracker needs at least a year. The coach will walk you through it.",
    start: "sunshine",
    target: { seconds: ONE_YEAR, label: "1 year" },
    hints: [
      "First try what many sites tell you: swap letters for symbols and put a ! on the end. Watch what the smart cracker does with it.",
      "Swaps are undone automatically. Try length instead: add three or four ordinary, unrelated words with spaces between them.",
    ],
    example: "lantern orbit pickle velvet",
  },
  {
    id: "strongest",
    kind: "pick",
    title: "Pick the strongest",
    lesson: "Character types do not decide strength. Ask instead: how would a cracker that knows every word and every trick guess this?",
    brief: "The forge's suppliers sent four candidate passwords for the shared parts portal. Which one holds out longest against the offline smart cracker?",
    prompt: "Pick the strongest password. One pick.",
    optionsArePasswords: true,
    options: [
      { id: "troub", label: "Tr0ub4dor&3", correct: false, why: "A dictionary word with two swaps, a capital and two characters on the end: the cracker undoes all of it." },
      { id: "summer", label: "Summer2026!!", correct: false, why: "A common password, a year and symbols on the end: all of it is in the first round of guesses." },
      { id: "qwerty", label: "qwertyuiop123", correct: false, why: "The top row of the keyboard plus 123: a common password with a tweak, in every breach list." },
      { id: "phrase", label: "lantern orbit pickle velvet", correct: true, why: "Four unrelated, less common words. No symbols, no digits, yet each word multiplies the guesses by about 100,000." },
    ],
  },
  {
    id: "spot",
    kind: "pick",
    title: "Spot the weakness",
    lesson: "A cracker is a list of human habits: favourite words, the same swaps, this year, a ! at the end. Following the rules the same way everyone does is a pattern.",
    brief: "The forge's old policy demanded a capital, a digit and a symbol. “P@ssw0rd2026!” met every rule. A naive meter says millions of years. The smart cracker says otherwise.",
    prompt: "Why does it fall so fast? One pick.",
    subject: { password: "P@ssw0rd2026!", reveal: "times" },
    options: [
      { id: "habits", label: "It is the word “password” with predictable swaps, plus this year and a ! on the end: exactly what crackers try first.", correct: true, why: "Each piece is a habit the cracker already knows. Together they need only about 150,000 guesses." },
      { id: "symbols", label: "It needs more symbols: two or three would fix it.", correct: false, why: "More predictable symbols add almost nothing. Compare the evidence:", evidence: "P@$$w0rd2026!!" },
      { id: "length", label: "It is under 16 characters. Make it longer by repeating part of it.", correct: false, why: "Length helps only if the extra part is unpredictable. Repeating a piece barely moves it:", evidence: "P@ssw0rd2026!2026!" },
      { id: "capital", label: "The capital P is in the obvious place. Move it to the middle.", correct: false, why: "True, but moving one capital only multiplies the guesses by a few:", evidence: "p@sSw0rd2026!" },
    ],
  },
  {
    id: "sixteen",
    kind: "pick",
    title: "Sixteen characters each",
    lesson: "Length helps only when the characters are unpredictable. Keyboard walks, alphabets and stock phrases are long but cheap.",
    brief: "Four apprentices each made a 16-character password for the tool store. Same length, very different strength.",
    prompt: "Which one actually holds? One pick.",
    optionsArePasswords: true,
    options: [
      { id: "walk", label: "1qaz2wsx3edc4rfv", correct: false, why: "Columns of neighbouring keys: a common password plus two keyboard walks." },
      { id: "abc", label: "abcdefghijklmnop", correct: false, why: "The alphabet in order: a sequence, a few dozen guesses." },
      { id: "dog", label: "ilovemydog2019!!", correct: false, why: "A stock phrase, a year and two symbols at the end: it falls in under a minute offline." },
      { id: "random", label: "vq7#Lm2pXz!e9Rb0", correct: true, why: "No pattern at all: every character is a fresh guess from 95. Strong, but only usable with a password manager." },
    ],
  },
  {
    id: "reuse",
    kind: "pick",
    title: "The reuse trap",
    lesson: "Strength cannot protect a password that has already leaked. One unique password per site (a password manager makes it easy), plus MFA, stops stuffing.",
    brief: "Dana, the forge's buyer, uses “Tundra7&Kettle!Mosaic” for her work email. She also used it on ShopNest, a (fictional) web shop that was breached last year. Look at the credential-stuffing row.",
    prompt: "What should Dana do? One pick.",
    subject: { password: "Tundra7&Kettle!Mosaic", reveal: "all" },
    options: [
      { id: "fine", label: "Nothing: it is long and random, so the smart cracker would take ages.", correct: false, why: "Stuffing does not crack anything. Attackers replay the leaked email and password on other sites, and this one works on the first try." },
      { id: "tweak", label: "Add one character to her work password so it no longer matches.", correct: false, why: "Attackers replay small tweaks of leaked passwords too:", evidence: "Tundra7&Kettle!Mosaic8" },
      { id: "shopnest", label: "Change only her ShopNest password; the work account was not breached.", correct: false, why: "The work account still uses the leaked password. That is exactly the account stuffing targets." },
      { id: "unique", label: "Give the work account a new, unique password from a password manager, and turn on MFA.", correct: true, why: "A unique password means a leak elsewhere is useless here, and MFA blocks a stolen password even if it works." },
    ],
  },
  {
    id: "century",
    kind: "build",
    title: "The century vault",
    lesson: "You now know the tricks. Build for length and unpredictability: several unrelated words, or a long random string kept in a password manager.",
    brief: "The forge's master vault needs a password the offline smart cracker cannot break for at least 100 years, and that is in no breach list. No coach this time.",
    start: "",
    target: { seconds: CENTURY, label: "100 years" },
    hints: [
      "Four or five unrelated words beat any amount of symbol swapping. Uncommon words count for more than common ones.",
      "Avoid famous phrases, song lyrics and anything about you: those are on the lists too.",
    ],
    example: "glacier marmot quarry falcon velvet",
  },
];
