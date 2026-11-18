import type { API, BlockTool, BlockToolConstructorOptions } from "@editorjs/editorjs";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { t } from "@/i18n";
import { lintCode, normalizeCodeLanguage, type CodeLint } from "@/lib/document/codeLint";
import { highlightCode } from "@/lib/document/highlight";
import { menuIcons } from "../menuIcons";
import { CodeBlockBar } from "./CodeBlockBar";

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
          this.paint();
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
    requestAnimationFrame(() => {
      if (this.wrapper.isConnected) {
        this.paint();
      }
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
    this.paint();
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

  private paint() {
    const { code, language } = this.data;
    const lines = code.split("\n");
    const rows = (lines.length ? lines : [""]).map((line) => {
      const row = document.createElement("div");
      row.className = "cdx-code__line";
      if (!line) {
        row.textContent = "\u00a0";
        return row;
      }
      if (!language || language === "plain") {
        row.textContent = line;
        return row;
      }
      row.innerHTML = highlightCode(line, language);
      return row;
    });
    this.pre.replaceChildren(...rows);
    const lint = lintCode(code, language);
    this.wrapper.classList.toggle("is-invalid", !lint.ok);
    this.paintGutter(code, lint);
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

  private paintGutter(code: string, lint: CodeLint) {
    const count = Math.max(code.split("\n").length, 1);
    const badLine = lint.ok ? 0 : lint.line ?? 0;
    const marks: HTMLSpanElement[] = [];
    for (let line = 1; line <= count; line += 1) {
      const span = document.createElement("span");
      span.textContent = String(line);
      if (line === badLine) {
        span.className = "is-bad";
      }
      marks.push(span);
    }
    this.gutter.replaceChildren(...marks);
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
