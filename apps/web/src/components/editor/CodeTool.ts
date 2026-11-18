import { highlightCode } from "@/lib/highlight";
import { CODE_LANGUAGES, codeLanguageLabel, type CodeLanguage } from "@/lib/codeLanguages";

export { CODE_LANGUAGES, codeLanguageLabel, type CodeLanguage };

type CodeData = {
  code: string;
  language: string;
};

export class CodeTool {
  static get toolbox() {
    return {
      title: "代码块 · code",
      icon: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"m16 18 6-6-6-6\"/><path d=\"m8 6-6 6 6 6\"/></svg>",
    };
  }

  static get enableLineBreaks() {
    return true;
  }

  static get isReadOnlySupported() {
    return true;
  }

  private data: CodeData;
  private wrap: HTMLDivElement | null = null;
  private area: HTMLTextAreaElement | null = null;
  private select: HTMLSelectElement | null = null;
  private highlight: HTMLElement | null = null;

  constructor({ data }: { data?: Partial<CodeData> }) {
    this.data = {
      code: typeof data?.code === "string" ? data.code : "",
      language: CODE_LANGUAGES.some((item) => item.id === data?.language)
        ? String(data?.language)
        : "typescript",
    };
  }

  render() {
    this.wrap = document.createElement("div");
    this.wrap.className = "code-tool cdx-block";

    this.select = document.createElement("select");
    this.select.className = "code-tool-lang";
    this.select.setAttribute("aria-label", "代码语言");
    for (const item of CODE_LANGUAGES) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      if (item.id === this.data.language) {
        option.selected = true;
      }
      this.select.append(option);
    }
    this.select.addEventListener("change", () => {
      this.data.language = this.select?.value ?? "typescript";
      this.paint();
    });

    const body = document.createElement("div");
    body.className = "code-tool-body";

    const pre = document.createElement("pre");
    pre.className = "code-tool-hl";
    pre.setAttribute("aria-hidden", "true");
    this.highlight = document.createElement("code");
    this.highlight.className = "hljs";
    pre.append(this.highlight);

    this.area = document.createElement("textarea");
    this.area.className = "code-tool-area";
    this.area.placeholder = "写一段代码…";
    this.area.value = this.data.code;
    this.area.spellcheck = false;
    this.area.addEventListener("input", () => {
      this.paint();
      this.resize();
    });
    this.area.addEventListener("scroll", () => {
      pre.scrollTop = this.area?.scrollTop ?? 0;
      pre.scrollLeft = this.area?.scrollLeft ?? 0;
    });

    body.append(pre, this.area);
    this.wrap.append(this.select, body);
    this.paint();
    requestAnimationFrame(() => this.resize());
    return this.wrap;
  }

  save(): CodeData {
    return {
      code: this.area?.value ?? "",
      language: this.select?.value ?? this.data.language,
    };
  }

  private paint() {
    if (!this.highlight || !this.area) {
      return;
    }
    const code = this.area.value.endsWith("\n") ? `${this.area.value} ` : this.area.value;
    this.highlight.innerHTML = highlightCode(code || " ", this.select?.value ?? this.data.language);
  }

  private resize() {
    if (!this.area) {
      return;
    }
    this.area.style.height = "auto";
    this.area.style.height = `${Math.max(180, this.area.scrollHeight)}px`;
  }
}
