(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.GameLogic = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // ---------- deterministic RNG ----------
  function cyrb53(str, seed) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randInt(rng, min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
  function randNonZeroInt(rng, min, max) {
    let v = 0;
    let guard = 0;
    while (v === 0 && guard < 50) { v = randInt(rng, min, max); guard++; }
    return v === 0 ? 1 : v;
  }
  function randChoice(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

  // ---------- number formatting ----------
  function fmtNum(n) {
    if (Number.isInteger(n)) return String(n);
    return (Math.round(n * 100) / 100).toString();
  }
  function fmtSigned(n) { return n < 0 ? "− " + fmtNum(Math.abs(n)) : "+ " + fmtNum(n); }

  // ---------- function bank ----------
  const FAMILY = {
    poly: "polinomial",
    abs: "modular",
    sqrt: "raiz",
    exp: "exponencial",
    log: "logarítmica",
    trig: "trigonométrica",
    rat: "racional (inverso)"
  };

  const CATEGORIES = [
    { // 0 linear
      family: "poly", label: "linear",
      gen(rng) { return { a: randNonZeroInt(rng, -4, 4), b: randInt(rng, -6, 6) }; },
      evaluate(p, x) { return p.a * x + p.b; },
      display(p) {
        let s = (p.a === 1 ? "" : p.a === -1 ? "−" : fmtNum(p.a)) + "x";
        if (p.b !== 0) s += " " + fmtSigned(p.b);
        return "f(x) = " + s;
      },
      domainSample(p, rng) { return -10 + rng() * 20; }
    },
    { // 1 quadratic
      family: "poly", label: "quadrática",
      gen(rng) { return { a: randNonZeroInt(rng, -3, 3), b: randInt(rng, -4, 4), c: randInt(rng, -5, 5) }; },
      evaluate(p, x) { return p.a * x * x + p.b * x + p.c; },
      display(p) {
        let s = (p.a === 1 ? "" : p.a === -1 ? "−" : fmtNum(p.a)) + "x²";
        if (p.b !== 0) s += " " + fmtSigned(p.b) + "x";
        if (p.c !== 0) s += " " + fmtSigned(p.c);
        return "f(x) = " + s;
      },
      domainSample(p, rng) { return -10 + rng() * 20; }
    },
    { // 2 cubic
      family: "poly", label: "cúbica",
      gen(rng) { return { a: randChoice(rng, [-2, -1, 1, 2]), b: randInt(rng, -3, 3) }; },
      evaluate(p, x) { return p.a * x * x * x + p.b * x; },
      display(p) {
        let s = (p.a === 1 ? "" : p.a === -1 ? "−" : fmtNum(p.a)) + "x³";
        if (p.b !== 0) s += " " + fmtSigned(p.b) + "x";
        return "f(x) = " + s;
      },
      domainSample(p, rng) { return -6 + rng() * 12; }
    },
    { // 3 abs
      family: "abs", label: "modular",
      gen(rng) { return { a: randNonZeroInt(rng, -3, 3), h: randInt(rng, -4, 4), k: randInt(rng, -4, 4) }; },
      evaluate(p, x) { return p.a * Math.abs(x - p.h) + p.k; },
      display(p) {
        const inner = p.h === 0 ? "x" : "x " + fmtSigned(-p.h);
        let s = (p.a === 1 ? "" : p.a === -1 ? "−" : fmtNum(p.a)) + "|" + inner + "|";
        if (p.k !== 0) s += " " + fmtSigned(p.k);
        return "f(x) = " + s;
      },
      domainSample(p, rng) { return -10 + rng() * 20; }
    },
    { // 4 sqrt
      family: "sqrt", label: "raiz",
      gen(rng) { return { a: randNonZeroInt(rng, -3, 3), h: randInt(rng, -4, 4), k: randInt(rng, -4, 4) }; },
      evaluate(p, x) { return x >= p.h ? p.a * Math.sqrt(x - p.h) + p.k : NaN; },
      display(p) {
        const inner = p.h === 0 ? "x" : "x " + fmtSigned(-p.h);
        let s = (p.a === 1 ? "" : p.a === -1 ? "−" : fmtNum(p.a)) + "√(" + inner + ")";
        if (p.k !== 0) s += " " + fmtSigned(p.k);
        return "f(x) = " + s;
      },
      domainSample(p, rng) { return p.h + rng() * 10; }
    },
    { // 5 exponential
      family: "exp", label: "exponencial",
      gen(rng) { return { a: randNonZeroInt(rng, -2, 2), c: randInt(rng, -4, 4) }; },
      evaluate(p, x) { return p.a * Math.pow(2, x) + p.c; },
      display(p) {
        let s = (p.a === 1 ? "" : p.a === -1 ? "−" : fmtNum(p.a)) + "· 2^x";
        if (p.c !== 0) s += " " + fmtSigned(p.c);
        return "f(x) = " + s;
      },
      domainSample(p, rng) { return -6 + rng() * 12; }
    },
    { // 6 log
      family: "log", label: "logarítmica",
      gen(rng) { return { a: randNonZeroInt(rng, -3, 3), c: randInt(rng, -4, 4) }; },
      evaluate(p, x) { return x > 0 ? p.a * (Math.log(x) / Math.log(2)) + p.c : NaN; },
      display(p) {
        let s = (p.a === 1 ? "" : p.a === -1 ? "−" : fmtNum(p.a)) + "· log₂(x)";
        if (p.c !== 0) s += " " + fmtSigned(p.c);
        return "f(x) = " + s;
      },
      domainSample(p, rng) { return 0.3 + rng() * 9.7; }
    },
    { // 7 sine
      family: "trig", label: "seno",
      gen(rng) { return { a: randInt(rng, 1, 4), b: randChoice(rng, [1, 2, 3, 0.5]), c: randInt(rng, -3, 3) }; },
      evaluate(p, x) { return p.a * Math.sin(p.b * x) + p.c; },
      display(p) {
        const bx = p.b === 1 ? "x" : fmtNum(p.b) + "x";
        let s = fmtNum(p.a) + "· sen(" + bx + ")";
        if (p.c !== 0) s += " " + fmtSigned(p.c);
        return "f(x) = " + s;
      },
      domainSample(p, rng) { return -10 + rng() * 20; }
    },
    { // 8 cosine
      family: "trig", label: "cosseno",
      gen(rng) { return { a: randInt(rng, 1, 4), b: randChoice(rng, [1, 2, 3, 0.5]), c: randInt(rng, -3, 3) }; },
      evaluate(p, x) { return p.a * Math.cos(p.b * x) + p.c; },
      display(p) {
        const bx = p.b === 1 ? "x" : fmtNum(p.b) + "x";
        let s = fmtNum(p.a) + "· cos(" + bx + ")";
        if (p.c !== 0) s += " " + fmtSigned(p.c);
        return "f(x) = " + s;
      },
      domainSample(p, rng) { return -10 + rng() * 20; }
    },
    { // 9 reciprocal
      family: "rat", label: "racional",
      gen(rng) { return { a: randNonZeroInt(rng, -6, 6), c: randInt(rng, -4, 4) }; },
      evaluate(p, x) { return x !== 0 ? p.a / x + p.c : NaN; },
      display(p) {
        let s = fmtNum(p.a) + "/x";
        if (p.c !== 0) s += " " + fmtSigned(p.c);
        return "f(x) = " + s;
      },
      domainSample(p, rng) { return (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 9.5); }
    }
  ];

  function buildPuzzle(seed) {
    const rngFunc = mulberry32(cyrb53(seed + ":func", 17));
    const catIdx = Math.floor(rngFunc() * CATEGORIES.length);
    const category = CATEGORIES[catIdx];
    const params = category.gen(rngFunc);
    const rngCheck = mulberry32(cyrb53(seed + ":check", 31));
    const samples = [];
    for (let i = 0; i < 24; i++) samples.push(category.domainSample(params, rngCheck));
    return { categoryIndex: catIdx, category, params, samples };
  }

  function puzzleFromCategoryIndex(categoryIndex, params, samples) {
    return { categoryIndex, category: CATEGORIES[categoryIndex], params, samples };
  }

  // ---------- expression parser ----------
  const FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp,
    ln: Math.log,
    log2: (v) => Math.log(v) / Math.log(2),
    log10: (v) => Math.log(v) / Math.log(10),
    log: (v) => Math.log(v) / Math.log(10)
  };

  function tokenize(input) {
    const s = input.toLowerCase().replace(/,/g, ".").replace(/\s+/g, "");
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/[0-9.]/.test(c)) {
        let j = i, seenDot = false;
        while (j < s.length && (/[0-9]/.test(s[j]) || (s[j] === "." && !seenDot))) {
          if (s[j] === ".") seenDot = true;
          j++;
        }
        tokens.push({ type: "num", value: parseFloat(s.slice(i, j)) });
        i = j;
      } else if (/[a-z_]/.test(c)) {
        let j = i;
        while (j < s.length && /[a-z0-9_]/.test(s[j])) j++;
        tokens.push({ type: "ident", value: s.slice(i, j) });
        i = j;
      } else if ("+-*/^(),".includes(c)) {
        tokens.push({ type: "op", value: c });
        i++;
      } else {
        throw new Error("símbolo inválido: " + c);
      }
    }
    return tokens;
  }

  function parseExpr(input) {
    const tokens = tokenize(input);
    let pos = 0;
    function peek() { return tokens[pos]; }
    function next() { return tokens[pos++]; }
    function canStartFactor(t) {
      return t && (t.type === "num" || t.type === "ident" || (t.type === "op" && t.value === "("));
    }

    function parsePrimary() {
      const t = peek();
      if (!t) throw new Error("expressão incompleta");
      if (t.type === "num") { next(); return { type: "num", value: t.value }; }
      if (t.type === "op" && t.value === "(") {
        next();
        const node = parseAddSub();
        const close = next();
        if (!close || close.value !== ")") throw new Error("parêntese não fechado");
        return node;
      }
      if (t.type === "ident") {
        next();
        if (t.value === "x") return { type: "var" };
        if (t.value === "pi" || t.value === "e") return { type: "const", name: t.value };
        if (FUNCS[t.value]) {
          const open = next();
          if (!open || open.value !== "(") throw new Error("esperava '(' depois de " + t.value);
          const arg = parseAddSub();
          const close = next();
          if (!close || close.value !== ")") throw new Error("parêntese não fechado");
          return { type: "func", name: t.value, arg };
        }
        throw new Error("identificador desconhecido: " + t.value);
      }
      throw new Error("token inesperado");
    }

    function parsePow() {
      const base = parsePrimary();
      const t = peek();
      if (t && t.type === "op" && t.value === "^") {
        next();
        const exp = parseUnary();
        return { type: "bin", op: "^", left: base, right: exp };
      }
      return base;
    }

    function parseUnary() {
      const t = peek();
      if (t && t.type === "op" && (t.value === "+" || t.value === "-")) {
        next();
        const operand = parseUnary();
        return t.value === "-" ? { type: "neg", operand } : operand;
      }
      return parsePow();
    }

    function parseMulDiv() {
      let node = parseUnary();
      for (;;) {
        const t = peek();
        if (t && t.type === "op" && (t.value === "*" || t.value === "/")) {
          next();
          const right = parseUnary();
          node = { type: "bin", op: t.value, left: node, right };
        } else if (canStartFactor(t)) {
          const right = parseUnary();
          node = { type: "bin", op: "*", left: node, right };
        } else break;
      }
      return node;
    }

    function parseAddSub() {
      let node = parseMulDiv();
      for (;;) {
        const t = peek();
        if (t && t.type === "op" && (t.value === "+" || t.value === "-")) {
          next();
          const right = parseMulDiv();
          node = { type: "bin", op: t.value, left: node, right };
        } else break;
      }
      return node;
    }

    const tree = parseAddSub();
    if (pos < tokens.length) throw new Error("sobrou texto inesperado na expressão");
    return tree;
  }

  function evalNode(node, x) {
    switch (node.type) {
      case "num": return node.value;
      case "var": return x;
      case "const": return node.name === "pi" ? Math.PI : Math.E;
      case "neg": return -evalNode(node.operand, x);
      case "func": return FUNCS[node.name](evalNode(node.arg, x));
      case "bin": {
        const l = evalNode(node.left, x), r = evalNode(node.right, x);
        switch (node.op) {
          case "+": return l + r;
          case "-": return l - r;
          case "*": return l * r;
          case "/": return l / r;
          case "^": return Math.pow(l, r);
        }
      }
    }
    throw new Error("nó inválido");
  }

  function guessMatches(guessTree, puzzle) {
    let ok = 0, total = 0;
    for (const x of puzzle.samples) {
      const actual = puzzle.category.evaluate(puzzle.params, x);
      if (!isFinite(actual)) continue;
      total++;
      let guess;
      try { guess = evalNode(guessTree, x); } catch (e) { guess = NaN; }
      const tol = Math.max(1e-2, Math.abs(actual) * 1e-3);
      if (isFinite(guess) && Math.abs(guess - actual) <= tol) ok++;
    }
    return total > 0 && ok === total;
  }

  return {
    cyrb53, mulberry32, randInt, randNonZeroInt, randChoice,
    fmtNum, fmtSigned, FAMILY, CATEGORIES,
    buildPuzzle, puzzleFromCategoryIndex,
    parseExpr, evalNode, guessMatches
  };
});
