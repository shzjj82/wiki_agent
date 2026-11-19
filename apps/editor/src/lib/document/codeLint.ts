import type { HLJSApi } from "highlight.js";
import { t } from "@/i18n";

/** highlight.js 按需加载，由 `./highlight` 加载完后交给这里；之前其余语言的文法检查一律放行。 */
let grammar: HLJSApi | null = null;

export function setGrammarEngine(engine: HLJSApi): void {
  grammar = engine;
}

/** 代码块语言。id 与 highlight.js 已注册的名称一致。 */
export const CODE_LANGUAGES: { id: string; label: string }[] = [
  { id: "plain", label: "" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "json", label: "JSON" },
  { id: "html", label: "HTML" },
  { id: "xml", label: "XML" },
  { id: "css", label: "CSS" },
  { id: "scss", label: "SCSS" },
  { id: "less", label: "Less" },
  { id: "python", label: "Python" },
  { id: "java", label: "Java" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "php", label: "PHP" },
  { id: "ruby", label: "Ruby" },
  { id: "swift", label: "Swift" },
  { id: "kotlin", label: "Kotlin" },
  { id: "sql", label: "SQL" },
  { id: "bash", label: "Shell" },
  { id: "yaml", label: "YAML" },
  { id: "ini", label: "INI" },
];

const CANONICAL = new Set(CODE_LANGUAGES.map((item) => item.id));

const ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  htm: "html",
  cs: "csharp",
  "c++": "cpp",
  cc: "cpp",
  kt: "kotlin",
  kts: "kotlin",
  rs: "rust",
  rb: "ruby",
  md: "plain",
  text: "plain",
  txt: "plain",
  plaintext: "plain",
};

export type CodeLint = { ok: true } | { ok: false; line?: number; detail: string };

/** 围栏语言名收成代码块下拉里的 id。认不出时当作纯文本，不再报错。 */
export function normalizeCodeLanguage(language: string | undefined): string {
  const raw = (language ?? "").trim().toLowerCase();
  if (!raw) {
    return "plain";
  }
  const mapped = ALIASES[raw] ?? raw;
  return CANONICAL.has(mapped) ? mapped : "plain";
}

export function codeLanguageLabel(language: string): string {
  if (language === "plain") {
    return t("code.plain");
  }
  return CODE_LANGUAGES.find((item) => item.id === language)?.label ?? language;
}

/**
 * 按语言做语法检查。
 * JSON、JavaScript、CSS、XML 用浏览器自带解析器。
 * 其余语言用 highlight.js 的文法：出现该语言不允许的片段即判为不通过。
 */
export function lintCode(source: string, language: string): CodeLint {
  const text = source.replace(/\r\n/g, "\n");
  if (!text.trim() || !language || language === "plain") {
    return { ok: true };
  }
  if (language === "json") {
    return lintJson(text);
  }
  if (language === "javascript") {
    return lintJavaScript(text);
  }
  if (language === "css") {
    return lintCss(text);
  }
  if (language === "xml") {
    return lintXml(text);
  }
  return lintGrammar(text, language);
}

function lintJson(source: string): CodeLint {
  try {
    JSON.parse(source);
    return { ok: true };
  } catch (err) {
    const raw = err instanceof SyntaxError && err.message ? err.message : t("code.json");
    const detail = raw.replace(/,\s*"[\s\S]*" is not valid JSON$/i, "").trim() || t("code.json");
    return { ok: false, line: jsonErrorLine(source, raw), detail };
  }
}

function jsonErrorLine(source: string, detail: string): number | undefined {
  const position = /position\s+(\d+)/i.exec(detail);
  if (position) {
    return source.slice(0, Number(position[1])).split("\n").length;
  }
  const lineColumn = /line\s+(\d+)\s+column\s+\d+/i.exec(detail);
  if (lineColumn) {
    return Number(lineColumn[1]);
  }
  const token = /Unexpected token\s+(?:'([^']*)'|"([^"]*)"|(\S+))/i.exec(detail);
  const lexeme = token?.[1] ?? token?.[2] ?? token?.[3];
  if (!lexeme) {
    return undefined;
  }
  const index = source.indexOf(lexeme);
  return index < 0 ? undefined : source.slice(0, index).split("\n").length;
}

function lintJavaScript(source: string): CodeLint {
  try {
    // 只做解析，不会执行函数体。函数包装会多出一个右括号，源码里没有它时改成“语句不完整”。
    new Function(source);
    return { ok: true };
  } catch (err) {
    let detail = err instanceof SyntaxError && err.message ? err.message : t("code.javascript");
    let line: number | undefined;
    if (detail === "Unexpected token '}'" && !source.includes("}")) {
      detail = t("code.incomplete");
      line = source.split("\n").length;
    }
    const at = /:(\d+):\d+/.exec(detail);
    return { ok: false, line: line ?? (at ? Number(at[1]) : undefined), detail };
  }
}

function lintCss(source: string): CodeLint {
  return lintCssSource(source);
}

function lintXml(source: string): CodeLint {
  const doc = new DOMParser().parseFromString(source, "application/xml");
  const error = doc.querySelector("parsererror");
  if (!error) {
    return { ok: true };
  }
  const raw = (error.textContent ?? "").replace(/\s+/g, " ").trim();
  const located = /error on line\s+(\d+)\s+at column\s+\d+:\s*(.+?)(?:\s+Below is a rendering|$)/i.exec(raw);
  if (located) {
    return { ok: false, line: Number(located[1]), detail: located[2].trim() || t("code.xml") };
  }
  return { ok: false, detail: raw || t("code.xml") };
}

/** 浏览器的 CSSStyleSheet 会丢掉非法声明而不报错，所以这里自己扫一遍结构。 */
function lintCssSource(source: string): CodeLint {
  let index = 0;
  let line = 1;
  let brace = 0;
  let paren = 0;
  const fail = (detail: string, at = line): CodeLint => ({ ok: false, line: at, detail });

  const bump = (ch: string) => {
    if (ch === "\n") {
      line += 1;
    }
  };

  while (index < source.length) {
    const ch = source[index];
    if (ch === "\n") {
      line += 1;
      index += 1;
      continue;
    }
    if (ch === "/" && source[index + 1] === "*") {
      const start = line;
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        bump(source[index]);
        index += 1;
      }
      if (index >= source.length) {
        return fail(t("code.cssUnclosed"), start);
      }
      index += 2;
      continue;
    }
    if (ch === "\"" || ch === "'") {
      const quote = ch;
      const start = line;
      index += 1;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\\" && index + 1 < source.length) {
          bump(source[index + 1]);
          index += 2;
          continue;
        }
        bump(source[index]);
        index += 1;
      }
      if (index >= source.length) {
        return fail(t("code.cssUnclosed"), start);
      }
      index += 1;
      continue;
    }
    if (ch === "{") {
      brace += 1;
      index += 1;
      continue;
    }
    if (ch === "}") {
      if (brace === 0) {
        return fail(t("code.css"), line);
      }
      brace -= 1;
      index += 1;
      continue;
    }
    if (ch === "(") {
      paren += 1;
      index += 1;
      continue;
    }
    if (ch === ")") {
      if (paren === 0) {
        return fail(t("code.css"), line);
      }
      paren -= 1;
      index += 1;
      continue;
    }
    if (brace > 0 && paren === 0 && /[A-Za-z_-]/.test(ch)) {
      const startLine = line;
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_-]/.test(source[index])) {
        index += 1;
      }
      const name = source.slice(start, index);
      let look = index;
      while (look < source.length && /[ \t\r\n]/.test(source[look])) {
        look += 1;
      }
      const next = source[look];
      if (next === ":") {
        look += 1;
        while (look < source.length && /[ \t\r\n]/.test(source[look])) {
          look += 1;
        }
        if (look >= source.length || source[look] === ";" || source[look] === "}") {
          return fail(t("code.cssValue", { name }), startLine);
        }
        const skipped = skipCssValue(source, look, line);
        if (!skipped.ok) {
          return fail(skipped.detail, skipped.line);
        }
        index = skipped.index;
        line = skipped.line;
        continue;
      }
      if (next === "{" || next === "," || next === ">" || next === "+" || next === "~" || next === "." || next === "#" || next === "[" || next === ":" || next === "*") {
        continue;
      }
      if (!next || next === ";" || next === "}") {
        return fail(t("code.cssValue", { name }), startLine);
      }
      return fail(t("code.css"), startLine);
    }
    if ((brace === 0 || paren === 0) && !/[\s\w\-.#:,[\]()*>+~%"'@/\\=&;]/.test(ch)) {
      return fail(t("code.illegal", { token: ch }), line);
    }
    index += 1;
  }
  if (brace !== 0 || paren !== 0) {
    return fail(t("code.cssUnclosed"), line);
  }
  return { ok: true };
}

function skipCssValue(
  source: string,
  start: number,
  startLine: number,
): { ok: true; index: number; line: number } | { ok: false; detail: string; line: number } {
  let index = start;
  let line = startLine;
  while (index < source.length) {
    const ch = source[index];
    if (ch === ";" || ch === "}" || ch === "{") {
      return { ok: true, index, line };
    }
    if (ch === "\n") {
      line += 1;
      index += 1;
      continue;
    }
    if (ch === "\"" || ch === "'") {
      const quote = ch;
      index += 1;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\n") {
          line += 1;
        }
        index += source[index] === "\\" ? 2 : 1;
      }
      if (index >= source.length) {
        return { ok: false, detail: t("code.cssUnclosed"), line };
      }
      index += 1;
      continue;
    }
    if (ch === "/" && source[index + 1] === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        if (source[index] === "\n") {
          line += 1;
        }
        index += 1;
      }
      if (index >= source.length) {
        return { ok: false, detail: t("code.cssUnclosed"), line };
      }
      index += 2;
      continue;
    }
    index += 1;
  }
  return { ok: true, index, line };
}

function lintGrammar(source: string, language: string): CodeLint {
  const hljs = grammar;
  if (!hljs || !hljs.getLanguage(language)) {
    return { ok: true };
  }
  try {
    hljs.highlight(source, { language, ignoreIllegals: false });
    return { ok: true };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "";
    const token = /Illegal lexeme "([\s\S]*?)"/.exec(raw)?.[1] ?? "";
    const detail = token ? t("code.illegal", { token }) : t("code.grammar");
    return { ok: false, line: firstIllegalLine(hljs, source, language), detail };
  }
}

function throwsIllegal(hljs: HLJSApi, source: string, language: string): boolean {
  try {
    hljs.highlight(source, { language, ignoreIllegals: false });
    return false;
  } catch {
    return true;
  }
}

function firstIllegalLine(hljs: HLJSApi, source: string, language: string): number | undefined {
  const lines = source.split("\n");
  let low = 1;
  let high = lines.length;
  let found: number | undefined;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (throwsIllegal(hljs, lines.slice(0, mid).join("\n"), language)) {
      found = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return found;
}
