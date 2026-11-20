import type { API, BlockTool, BlockToolConstructorOptions } from "@editorjs/editorjs";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { t } from "@/i18n";
import { lintCode, normalizeCodeLanguage, type CodeLint } from "@/lib/document/codeLint";
import { menuIcons } from "../menuIcons";
import { CodeBlockBar } from "./CodeBlockBar";

/** highlight.js 带 20 种语言，第一次画代码块时再加载；加载前先显示纯文本。 */
let highlightCode: ((source: string, language?: string) => string) | null = null;
let highlighterLoading: Promise<void> | null = null;
function loadHighlighter(): Promise<void> {
  highlighterLoading ??= import("@/lib/document/highlight").then((m) => {
    highlightCode = m.highlightCode;
  });
  return highlighterLoading;
}

function fillCodeLine(row: HTMLDivElement, line: string, language: string) {
  if (!line) {
    row.textContent = "\u00a0";
    return;
  }
  if (!language || !highlightCode) {
    row.textContent = line;
    return;
  }
  row.innerHTML = highlightCode(line, language);
}

type CodeBlockData = {
  code?: string;
  language?: string;
};

/** 正文里的代码块：按语言高亮，并标出语法错误。 */
export class CodeBlockTool implements BlockTool {
  static get toolbox() {
    return {
      title: "Code · code",
      icon: menuIcons.code,
    };
  }

  static get isReadOnlySupported() {
    return true;
  }

  /** 回车留在代码里换行，不交给编辑器去新开一段 */
  static get enableLineBreaks() {
    return true;
  }

  static get conversionConfig() {
    return {
      export: (data: CodeBlockData) => data.code ?? "",
      import: (text: string) => ({
        code: text.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""),
        language: "plain",
      }),
    };
  }

  private api: API;
  private data: { code: string; language: string };
  private readOnly: boolean;
  private wrapper = document.createElement("div");
  private status = document.createElement("p");
  private gutter = document.createElement("div");
  private pre = document.createElement("pre");
  private fault = document.createElement("div");
  private input: HTMLTextAreaElement | null = null;
  private barHost = document.createElement("div");
  private barRoot: Root | null = null;
  private abort = new AbortController();
  /** 已经画过的行。打字时只改动到的那几行，其余节点留着 */
  private lineRows: HTMLDivElement[] = [];
  private lineCache: string[] = [];
  private gutterRows: HTMLSpanElement[] = [];
  private gutterBad = 0;
  private paintFrame = 0;
  private layoutFrame = 0;
  private lintTimer = 0;
  private paintedLanguage = "";
  private highlightReady = false;
  private waitingHighlight = false;
  private lintKey = "";
  private lintResult: CodeLint = { ok: true };

  constructor({ data, api, readOnly }: BlockToolConstructorOptions<CodeBlockData>) {
    this.api = api;
    this.readOnly = Boolean(readOnly);
    this.data = {
      code: String(data?.code ?? "").replace(/\r\n/g, "\n"),
      language: normalizeCodeLanguage(data?.language),
    };
  }

  render() {
    this.abort.abort();
    this.abort = new AbortController();
    this.cancelScheduled();
    const signal = this.abort.signal;

    this.wrapper.className = "cdx-code";
    this.wrapper.replaceChildren();

    this.mountBar();

    const stage = document.createElement("div");
    stage.className = "cdx-code__stage";
    const sheet = document.createElement("div");
    sheet.className = "cdx-code__sheet";
    this.gutter.className = "cdx-code__gutter";
    this.gutter.setAttribute("aria-hidden", "true");
    const sizer = document.createElement("div");
    sizer.className = "cdx-code__sizer";
    this.fault.className = "cdx-code__fault";
    this.fault.hidden = true;
    this.pre.className = "cdx-code__text hljs";
    sizer.append(this.fault, this.pre);

    if (!this.readOnly) {
      const input = document.createElement("textarea");
      input.className = "cdx-code__text cdx-code__input";
      input.spellcheck = false;
      input.autocomplete = "off";
      input.autocapitalize = "off";
      input.placeholder = t("code.placeholder");
      input.value = this.data.code;
      input.wrap = "off";
      input.addEventListener(
        "input",
        () => {
          this.data.code = input.value.replace(/\r\n/g, "\n");
          this.paint("typing");
        },
        { signal },
      );
      input.addEventListener("keydown", (event) => this.onKeyDown(event, input), { signal });
      // 窄屏不允许把光标放进代码：一聚焦 iOS 会整页放大，也进不了正常编辑
      const mobileCode = window.matchMedia("(max-width: 767px)");
      const lockMobileFocus = () => {
        input.disabled = mobileCode.matches;
        if (mobileCode.matches && document.activeElement === input) {
          input.blur();
        }
      };
      lockMobileFocus();
      mobileCode.addEventListener("change", lockMobileFocus, { signal });
      input.addEventListener(
        "focus",
        () => {
          if (mobileCode.matches) {
            input.blur();
          }
        },
        { signal },
      );
      this.input = input;
      sizer.append(input);
    } else {
      this.input = null;
    }

    sheet.append(this.gutter, sizer);
    stage.append(sheet);
    this.status.className = "cdx-code__status";
    this.status.hidden = true;
    this.wrapper.append(this.barHost, stage, this.status);
    this.paint();
    // 首帧还没布局，错误条的行高要等排完再量一次。不要占用打字用的那一帧。
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = 0;
      if (this.wrapper.isConnected) this.paintLint(true);
    });
    return this.wrapper;
  }

  save() {
    return { code: this.data.code, language: this.data.language };
  }

  validate() {
    return true;
  }

  destroy() {
    this.cancelScheduled();
    this.barRoot?.unmount();
    this.barRoot = null;
    this.abort.abort();
  }

  private mountBar() {
    if (!this.barRoot) {
      this.barRoot = createRoot(this.barHost);
    }
    this.barRoot.render(
      createElement(CodeBlockBar, {
        language: this.data.language,
        readOnly: this.readOnly,
        getCode: () => this.data.code,
        onLanguage: (language: string) => {
          this.data.language = normalizeCodeLanguage(language);
          this.paint();
          this.mountBar();
          this.wrapper.dispatchEvent(new Event("input", { bubbles: true }));
        },
      }),
    );
  }

  /** 回车只在代码里换行。空行也留在代码里，不结束这块编辑。 */
  private onKeyDown(event: KeyboardEvent, input: HTMLTextAreaElement) {
    if (event.isComposing || event.keyCode === 229) {
      return;
    }
    if (event.key === "Tab" && !event.altKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      input.setRangeText("  ", start, end, "end");
      this.commit(input);
      return;
    }
    if (event.key === "Backspace" && !event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? start;
      if (start === 0 && end === 0) {
        event.preventDefault();
        event.stopPropagation();
        if (!input.value) {
          this.leaveDown();
        }
      }
      return;
    }
    if (event.key === "Delete" && !event.altKey && !event.metaKey && !event.ctrlKey) {
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? start;
      if (start === end && end === input.value.length) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (event.key !== "Enter" || event.altKey || event.metaKey || event.ctrlKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    const before = input.value.slice(0, start);
    const lineBefore = before.slice(before.lastIndexOf("\n") + 1);
    const indent = /^[ \t]*/.exec(lineBefore)?.[0] ?? "";
    const extra = /[{[(]\s*$/.test(lineBefore) ? "  " : "";
    input.setRangeText(`\n${indent}${extra}`, start, end, "end");
    this.commit(input);
    this.revealCaret(input);
  }

  private commit(input: HTMLTextAreaElement) {
    this.data.code = input.value.replace(/\r\n/g, "\n");
    this.paint("typing");
    this.wrapper.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** 空代码块换成正文；否则在代码块下面插入一段 */
  private leaveDown() {
    const index = this.api.blocks.getCurrentBlockIndex();
    if (index < 0) {
      return;
    }
    this.input?.blur();
    if (!this.data.code.trim()) {
      const block = this.api.blocks.getBlockByIndex(index);
      if (!block) {
        return;
      }
      void this.api.blocks.convert(block.id, "paragraph").then((next) => {
        this.api.caret.setToBlock(next.id, "start");
      });
      return;
    }
    const created = this.api.blocks.insert("paragraph", { text: "" }, undefined, index + 1, true);
    requestAnimationFrame(() => {
      created.holder.querySelector<HTMLElement>("[contenteditable='true']")?.focus();
      this.api.caret.setToBlock(created.id, "start");
    });
  }

  private revealCaret(input: HTMLTextAreaElement) {
    const stage = this.wrapper.querySelector<HTMLElement>(".cdx-code__stage");
    if (!stage) {
      return;
    }
    const pos = input.selectionStart ?? 0;
    const line = input.value.slice(0, pos).split("\n").length;
    const style = getComputedStyle(input);
    const lineHeight = Number.parseFloat(style.lineHeight) || 24;
    const pad = Number.parseFloat(style.paddingTop) || 12;
    const top = pad + (line - 1) * lineHeight;
    const bottom = top + lineHeight;
    if (top < stage.scrollTop) {
      stage.scrollTop = top;
    } else if (bottom > stage.scrollTop + stage.clientHeight) {
      stage.scrollTop = bottom - stage.clientHeight;
    }
  }

  /** 打开和换语言马上画；连续打字合并到下一帧，语法检查再晚一点 */
  private paint(mode: "now" | "typing" = "now") {
    if (mode === "typing") {
      this.requestPaint();
      return;
    }
    this.cancelScheduled();
    this.paintVisual();
    this.paintLint();
  }

  private requestPaint() {
    if (!this.paintFrame) {
      this.paintFrame = requestAnimationFrame(() => {
        this.paintFrame = 0;
        if (this.pre.isConnected) this.paintVisual();
      });
    }
    window.clearTimeout(this.lintTimer);
    this.lintTimer = window.setTimeout(() => {
      this.lintTimer = 0;
      if (this.pre.isConnected) this.paintLint();
    }, 200);
  }

  private cancelScheduled() {
    if (this.paintFrame) {
      cancelAnimationFrame(this.paintFrame);
      this.paintFrame = 0;
    }
    if (this.layoutFrame) {
      cancelAnimationFrame(this.layoutFrame);
      this.layoutFrame = 0;
    }
    window.clearTimeout(this.lintTimer);
    this.lintTimer = 0;
  }

  private paintVisual() {
    const { code, language } = this.data;
    const canHighlight = Boolean(highlightCode && language && language !== "plain");
    if (!canHighlight && language && language !== "plain" && !this.waitingHighlight) {
      this.waitingHighlight = true;
      void loadHighlighter().then(
        () => {
          this.waitingHighlight = false;
          if (!this.pre.isConnected) return;
          this.paintVisual();
          this.paintLint();
        },
        () => {
          this.waitingHighlight = false;
        },
      );
    }
    if (this.paintedLanguage !== language || this.highlightReady !== canHighlight) {
      this.lineCache = [];
      this.lineRows = [];
      this.paintedLanguage = language;
      this.highlightReady = canHighlight;
    }
    const lines = code.split("\n");
    this.syncLines(lines.length ? lines : [""], canHighlight ? language : "");
    this.syncGutter(Math.max(lines.length, 1));
  }

  /** 前后相同的行不动；中间插入或删除只重建那一段 */
  private syncLines(lines: string[], language: string) {
    const prev = this.lineCache;
    let start = 0;
    while (start < prev.length && start < lines.length && prev[start] === lines[start]) start += 1;
    let prevEnd = prev.length;
    let nextEnd = lines.length;
    while (prevEnd > start && nextEnd > start && prev[prevEnd - 1] === lines[nextEnd - 1]) {
      prevEnd -= 1;
      nextEnd -= 1;
    }
    if (nextEnd === start && prevEnd === start) return;
    if (nextEnd - start === prevEnd - start) {
      for (let index = start; index < nextEnd; index += 1) {
        fillCodeLine(this.lineRows[index], lines[index], language);
        this.lineCache[index] = lines[index];
      }
      return;
    }
    const fresh = lines.slice(start, nextEnd).map((line) => {
      const row = document.createElement("div");
      row.className = "cdx-code__line";
      fillCodeLine(row, line, language);
      return row;
    });
    this.lineRows = [...this.lineRows.slice(0, start), ...fresh, ...this.lineRows.slice(prevEnd)];
    this.lineCache = [...prev.slice(0, start), ...lines.slice(start, nextEnd), ...prev.slice(prevEnd)];
    this.pre.replaceChildren(...this.lineRows);
  }

  private syncGutter(count: number) {
    if (this.gutterRows.length === count) return;
    if (this.gutterRows.length < count) {
      const frag = document.createDocumentFragment();
      for (let index = this.gutterRows.length; index < count; index += 1) {
        const span = document.createElement("span");
        span.textContent = String(index + 1);
        this.gutterRows.push(span);
        frag.append(span);
      }
      this.gutter.append(frag);
    } else {
      for (let index = this.gutterRows.length - 1; index >= count; index -= 1) {
        this.gutterRows[index].remove();
      }
      this.gutterRows.length = count;
    }
    if (this.gutterBad > count) {
      this.markBadLine(0);
      return;
    }
    if (this.gutterBad > 0) this.gutterRows[this.gutterBad - 1]?.classList.add("is-bad");
  }

  private paintLint(reposition = false) {
    const { code, language } = this.data;
    const key = `${language}\0${code}`;
    if (key === this.lintKey) {
      if (reposition && !this.lintResult.ok) this.placeFault(this.lintResult.line);
      return;
    }
    this.lintKey = key;
    this.lintResult = lintCode(code, language);
    const lint = this.lintResult;
    this.wrapper.classList.toggle("is-invalid", !lint.ok);
    this.markBadLine(lint.ok ? 0 : lint.line ?? 0);
    if (!lint.ok) {
      this.status.hidden = false;
      this.status.textContent = lint.line
        ? t("code.invalidAt", { line: lint.line, detail: lint.detail })
        : t("code.invalid", { detail: lint.detail });
      this.placeFault(lint.line);
      return;
    }
    this.status.hidden = true;
    this.status.textContent = "";
    this.fault.hidden = true;
  }

  private markBadLine(line: number) {
    const next = line > 0 ? line : 0;
    if (next === this.gutterBad) return;
    this.gutterRows[this.gutterBad - 1]?.classList.remove("is-bad");
    if (next > 0) this.gutterRows[next - 1]?.classList.add("is-bad");
    this.gutterBad = next;
  }

  private placeFault(line?: number) {
    if (!line || line < 1) {
      this.fault.hidden = true;
      return;
    }
    const sample = this.input ?? this.pre;
    const style = getComputedStyle(sample);
    const fontSize = Number.parseFloat(style.fontSize);
    const rawLine = Number.parseFloat(style.lineHeight);
    const lineHeight = Number.isFinite(rawLine) && rawLine > 0 ? rawLine : (Number.isFinite(fontSize) ? 24 : 24);
    const rawPad = Number.parseFloat(style.paddingTop);
    const pad = Number.isFinite(rawPad) ? rawPad : 10;
    this.fault.hidden = false;
    this.fault.style.top = `${pad + (line - 1) * lineHeight}px`;
    this.fault.style.height = `${lineHeight}px`;
  }
}
