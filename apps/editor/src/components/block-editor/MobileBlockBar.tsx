import type { Ref } from "react";
import { ChevronDown, Ellipsis, Plus, Redo2, Undo2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { menuIcons } from "./menuIcons";

/** 底栏样式按钮的 aria-label 只能取这几个键（写成联合类型，动态取词才不会绕过 i18n 的类型校验） */
type BlockStyleLabel =
  | "blockEditor.styleText"
  | "blockEditor.styleH1"
  | "blockEditor.styleH2"
  | "blockEditor.styleH3"
  | "blockEditor.styleBullet"
  | "blockEditor.styleNumbered"
  | "blockEditor.styleTodo"
  | "blockEditor.styleQuote"
  | "blockEditor.styleCode";

type BlockStyle = { key: string; icon: string; label: BlockStyleLabel; tool: string; data?: Record<string, unknown> };

/** 移动端底栏直接摆出来的块样式：点图标即切换，不再弹菜单。key 与 blockIconKey 的返回值一致 */
const blockStyles: BlockStyle[] = [
  { key: "T", icon: menuIcons.text, label: "blockEditor.styleText", tool: "paragraph" },
  { key: "H1", icon: menuIcons.h1, label: "blockEditor.styleH1", tool: "header", data: { level: 1 } },
  { key: "H2", icon: menuIcons.h2, label: "blockEditor.styleH2", tool: "header", data: { level: 2 } },
  { key: "H3", icon: menuIcons.h3, label: "blockEditor.styleH3", tool: "header", data: { level: 3 } },
  { key: "ul", icon: menuIcons.ul, label: "blockEditor.styleBullet", tool: "list", data: { style: "unordered" } },
  { key: "ol", icon: menuIcons.ol, label: "blockEditor.styleNumbered", tool: "list", data: { style: "ordered" } },
  { key: "todo", icon: menuIcons.todo, label: "blockEditor.styleTodo", tool: "todo" },
  { key: "quote", icon: menuIcons.quote, label: "blockEditor.styleQuote", tool: "quote" },
  { key: "code", icon: menuIcons.code, label: "blockEditor.styleCode", tool: "code" },
];

/** 底部工具栏按钮：阻止默认行为抢焦点，保证编辑器光标不丢（pointerdown / mousedown 都兜住） */
function keepEditorFocus(event: { preventDefault: () => void }) {
  event.preventDefault();
}

/** 收起软键盘 */
function dismissKeyboard() {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
}

const barIconProps = { size: 20 };
const barButtonClass =
  "flex h-11 w-10 shrink-0 items-center justify-center rounded-lg text-foreground/70 transition-colors active:bg-muted active:text-foreground";

type BarProps = {
  barRef: Ref<HTMLDivElement>;
  keyboardOpen: boolean;
  embed: boolean;
  blockKind: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onInsert: () => void;
  onStyle: (tool: string, data?: Record<string, unknown>) => void;
  onAi: () => void;
  onSettings: () => void;
};

export function MobileBlockBar({ barRef, keyboardOpen, embed, blockKind, canUndo, canRedo, onUndo, onRedo, onInsert, onStyle, onAi, onSettings }: BarProps) {
  const { t } = useTranslation();
  /** 代码块不提供正文样式快捷键：那些转换对代码没有意义 */
  const showStyleShortcuts = blockKind !== "code";
  const styles = embed ? blockStyles.filter((item) => item.key !== "todo") : blockStyles;
  return (
    <div
      ref={barRef}
      /* 不再是 fixed：占据父级布局流的一行，内容怎么滚它都不动 */
      className="flex items-center gap-1 border-t border-border bg-background pt-1"
      style={{
        // 键盘弹起时去掉底部安全距离，贴住键盘上沿
        paddingBottom: keyboardOpen ? "0.375rem" : "max(0.375rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
        paddingRight: "max(0.5rem, env(safe-area-inset-right))",
        // 只允许横向手势（样式条要滑）。竖向划动若交给浏览器，
        // iOS 会去“拖动整页”（平移可视视口），外壳跟着 offsetTop 走就是整屏抖动
        touchAction: "pan-x",
      }}
    >
      {/* 撤销 / 重做：误删一个块按一下就能回来 */}
      <button
        type="button"
        aria-label={t("app.undo")}
        disabled={!canUndo}
        className={cn(barButtonClass, !canUndo && "opacity-40")}
        onPointerDown={keepEditorFocus}
        onMouseDown={keepEditorFocus}
        onClick={onUndo}
      >
        <Undo2 {...barIconProps} />
      </button>
      <button
        type="button"
        aria-label={t("app.redo")}
        disabled={!canRedo}
        className={cn(barButtonClass, !canRedo && "opacity-40")}
        onPointerDown={keepEditorFocus}
        onMouseDown={keepEditorFocus}
        onClick={onRedo}
      >
        <Redo2 {...barIconProps} />
      </button>
      {/* pointerdown / mousedown 都阻止默认行为，避免点按钮时编辑器失焦、光标丢失 */}
      <button type="button" aria-label={t("app.insertBlock")} className={barButtonClass} onPointerDown={keepEditorFocus} onMouseDown={keepEditorFocus} onClick={onInsert}>
        <Plus {...barIconProps} />
      </button>
      {/* 字体/块样式直接铺在底栏上，点哪个就是哪种，不再弹菜单。代码块里不展示 */}
      {showStyleShortcuts ? (
        <div className="editor-style-strip flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {styles.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-label={t(item.label)}
              aria-pressed={blockKind === item.key}
              className={cn(
                "flex h-11 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                blockKind === item.key ? "bg-muted text-foreground" : "text-foreground/70 active:bg-muted",
              )}
              onPointerDown={keepEditorFocus}
              onMouseDown={keepEditorFocus}
              onClick={() => onStyle(item.tool, item.data)}
            >
              <span className="pointer-events-none flex h-[18px] w-[18px] items-center justify-center" dangerouslySetInnerHTML={{ __html: item.icon }} />
            </button>
          ))}
        </div>
      ) : (
        <div className="min-w-0 flex-1" />
      )}
      {!embed ? (
        <button type="button" aria-label={t("app.aiChatTitle")} className={barButtonClass} onPointerDown={keepEditorFocus} onMouseDown={keepEditorFocus} onClick={onAi}>
          <span className="text-[11px] font-semibold leading-none tracking-wide">AI</span>
        </button>
      ) : null}
      <button type="button" aria-label={t("app.blockActions")} className={barButtonClass} onPointerDown={keepEditorFocus} onMouseDown={keepEditorFocus} onClick={onSettings}>
        <Ellipsis {...barIconProps} />
      </button>
      <button type="button" aria-label={t("app.hideKeyboard")} className={barButtonClass} onClick={dismissKeyboard}>
        <ChevronDown {...barIconProps} />
      </button>
    </div>
  );
}

export function BlockRemovedToast({ count, top, onUndo, onClose }: { count: number; top: number; onUndo: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-3" style={{ top, transform: "translateY(-100%)" }}>
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-foreground px-3.5 py-2 text-background shadow-lg">
        <span className="text-sm">{t("app.blockDeleted", { count })}</span>
        <button type="button" className="text-sm font-medium underline underline-offset-2" onClick={onUndo}>
          {t("app.undo")}
        </button>
        <button type="button" aria-label={t("common.cancel")} className="text-background/60" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
