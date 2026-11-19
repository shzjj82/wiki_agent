/** 正文栏宽度。图片块本身是收缩的，不能拿它的宽度当百分比基准 */
export function columnWidth(wrapper: HTMLElement): number {
  const redactor = wrapper.closest(".codex-editor__redactor");
  if (redactor instanceof HTMLElement) {
    const style = getComputedStyle(redactor);
    const pad = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
    const width = redactor.clientWidth - pad;
    if (width > 0) {
      return width;
    }
  }
  return wrapper.clientWidth;
}

export function scrollParent(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement;
  while (node && node !== document.body) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll") {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function openImagePreview(src: string, alt: string) {
  const overlay = document.createElement("div");
  overlay.className = "cdx-image-preview";
  const image = document.createElement("img");
  image.src = src;
  image.alt = alt;
  image.addEventListener("click", (event) => event.stopPropagation());
  overlay.append(image);
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      close();
    }
  };
  overlay.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.append(overlay);
}

export async function downloadImage(src: string, name: string, fallbackUrl: string) {
  try {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error("download");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  } catch {
    const link = document.createElement("a");
    link.href = fallbackUrl || src;
    link.download = name;
    link.target = "_blank";
    link.rel = "noopener";
    link.click();
  }
}

/** 浏览器没有“取消选择文件”事件：窗口失焦后再聚焦且没收到 change，就当作取消 */
export function pickFile(accept: string, onFile: (file: File) => void, onCancel: () => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.hidden = true;
  document.body.append(input);
  let settled = false;
  let dialogOpened = false;
  const finish = () => {
    input.remove();
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
  };
  const onBlur = () => {
    dialogOpened = true;
  };
  const onFocus = () => {
    window.setTimeout(() => {
      if (!settled && dialogOpened) {
        finish();
        onCancel();
      }
    }, 200);
  };
  input.addEventListener("change", () => {
    settled = true;
    const file = input.files?.[0];
    finish();
    if (file) {
      onFile(file);
    } else {
      onCancel();
    }
  });
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  input.click();
  if (!dialogOpened) {
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
    input.remove();
  }
}
