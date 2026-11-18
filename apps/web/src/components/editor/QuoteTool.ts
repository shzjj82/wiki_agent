import type { BlockTool, BlockToolConstructorOptions } from "@editorjs/editorjs";

type QuoteData = {
  text: string;
  caption?: string;
};

type QuoteConfig = {
  quotePlaceholder?: string;
};

const QUOTE_ICON = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z\"/><path d=\"M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z\"/></svg>";

/**
 * 单输入引用块。
 * enableLineBreaks=false → Enter 由 Editor.js 结束当前块并新建段落。
 * Shift+Enter → 引用内换行。
 */
export class QuoteTool implements BlockTool {
  static get toolbox() {
    return {
      title: "引用 · quote",
      icon: QUOTE_ICON,
    };
  }

  static get isReadOnlySupported() {
    return true;
  }

  static get enableLineBreaks() {
    return false;
  }

  static get conversionConfig() {
    return {
      import: "text",
      export: (data: QuoteData) => data.text ?? "",
    };
  }

  static get sanitize() {
    return {
      text: { br: true },
      caption: {},
    };
  }

  private readOnly: boolean;
  private data: QuoteData;
  private quotePlaceholder: string;
  private textEl: HTMLDivElement | null = null;

  constructor({ data, readOnly, config }: BlockToolConstructorOptions<QuoteData, QuoteConfig>) {
    this.readOnly = Boolean(readOnly);
    this.data = {
      text: typeof data?.text === "string" ? data.text : "",
      caption: typeof data?.caption === "string" ? data.caption : "",
    };
    this.quotePlaceholder = config?.quotePlaceholder?.trim() || "引用内容，Enter 结束";
  }

  render() {
    const wrap = document.createElement("blockquote");
    wrap.className = "cdx-quote";

    const text = document.createElement("div");
    text.className = "cdx-quote__text cdx-input";
    text.contentEditable = this.readOnly ? "false" : "true";
    text.dataset.placeholder = this.quotePlaceholder;
    text.innerHTML = this.data.text || "";
    this.textEl = text;

    if (!this.readOnly) {
      text.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key !== "Enter" || !event.shiftKey || event.isComposing) {
          return;
        }
        // Shift+Enter：引用内换行（普通 Enter 交给 Editor.js 退出块）
        event.preventDefault();
        event.stopPropagation();
        document.execCommand("insertLineBreak");
      });

      window.requestAnimationFrame(() => {
        text.focus();
      });
    }

    wrap.append(text);
    return wrap;
  }

  save() {
    return {
      text: this.textEl?.innerHTML ?? this.data.text,
      caption: this.data.caption ?? "",
    };
  }

  validate() {
    return true;
  }
}
