import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EditorJS from "@editorjs/editorjs";
import Delimiter from "@editorjs/delimiter";
import Header from "@editorjs/header";
import List from "@editorjs/list";
import Quote from "@editorjs/quote";
import Table from "@editorjs/table";
import DragDrop from "editorjs-drag-drop";
import type { EditorJsDocument } from "@myblog/shared";
import { AiAssistTriggerTool } from "./tools/AiAssistTriggerTool";
import { AskAiInlineTool } from "./tools/AskAiInlineTool";
import { editorI18n } from "./editorI18n";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@/lib/useMediaQuery";
import { useVisualViewport } from "@/lib/useKeyboardInset";
import { PageLinkTool, type PageLinkData } from "./tools/PageLinkTool";
import { AttachmentTool } from "./tools/AttachmentTool";
import { ImageBlockTool } from "./tools/ImageBlockTool";
import { TodoBlockTool, type TodoBlockDetailRequest } from "./tools/TodoBlockTool";
import { VideoBlockTool } from "./tools/VideoBlockTool";
import { CodeBlockTool } from "./tools/CodeBlockTool";
import type { AttachmentData } from "@/store/fileStore";
import { bindEditingGuards } from "./editingGuards";
import { menuIcons } from "./menuIcons";
import { bindToolbarAnchor, blockIconKey } from "./toolbarAnchor";
import { revealText } from "./revealText";
import { useDocHistory } from "./useDocHistory";
import { bindPaste } from "./paste";
import { HeadingOutline } from "@/components/heading-outline";
import { BlockRemovedToast, MobileBlockBar } from "./MobileBlockBar";
import { cn } from "@/lib/utils";
import "./blockEditor.css";

/** 撤销 / 重做的对外接口：顶栏按钮和快捷键都在 App 里，靠它调到编辑器内部的历史栈 */
export type EditorHistoryApi = {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

const inlineTools = ["link", "bold", "italic", "askAi"];

/** page=文档页全功能；embed=嵌入详情等场景，不含子页面 / 待办 / AI */
export type BlockEditorVariant = "page" | "embed";

type Props = {
  doc: EditorJsDocument;
  pageId?: string;
  onChange: (document: EditorJsDocument) => void;
  onOpenPage?: (pageId: string) => void;
  onCreateChild?: () => Promise<PageLinkData>;
  resolvePageTitle?: (pageId: string) => string | undefined;
  onReady?: (editor: EditorJS | null) => void;
  onAi?: (blockIndex: number) => void;
  onAskSelection?: (text: string) => void;
  onUploadFile?: (file: File) => Promise<AttachmentData>;
  onUploadError?: (message: string) => void;
  onOpenFile?: (data: AttachmentData, replace: (next: AttachmentData) => void) => void;
  onConfirmDeleteFile?: (name: string) => Promise<boolean>;
  /** 打开后定位到这段文字；nonce 变化时重新定位，同一页也能再次触发 */
  reveal?: { text: string; nonce: number } | null;
  readOnly?: boolean;
  /** 非移动端的撤销 / 重做按钮在顶栏，通过这个回调拿到编辑器里的历史栈 */
  onHistory?: (api: EditorHistoryApi | null) => void;
  /** 移动端底栏挂载点（父级布局流里的一个空容器）；不传则不渲染底栏 */
  barSlot?: HTMLElement | null;
  variant?: BlockEditorVariant;
  className?: string;
  /** 待办块「添加 / 编辑」打开详情对话框 */
  onTodoDetail?: (request: TodoBlockDetailRequest) => void;
};

export function BlockEditor({
  doc,
  pageId,
  onChange,
  onOpenPage,
  onCreateChild,
  resolvePageTitle,
  onReady,
  onAi,
  onAskSelection,
  onUploadFile,
  onUploadError,
  onOpenFile,
  onConfirmDeleteFile,
  reveal,
  readOnly = false,
  onHistory,
  barSlot,
  variant = "page",
  className,
  onTodoDetail,
}: Props) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const viewport = useVisualViewport();
  const { keyboardOpen } = viewport;
  const embed = variant === "embed";
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  /** 当前块的样式（用于底栏高亮），取值与 blockIconKey 一致 */
  const [blockKind, setBlockKind] = useState("T");
  const editorInstanceRef = useRef<EditorJS | null>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);
  /** 正在做块样式转换：这期间焦点丢失是正常现象，不算离开编辑器 */
  const switchingRef = useRef(false);
  const revealRef = useRef(reveal);
  revealRef.current = reveal;
  const onChangeRef = useRef(onChange);
  const onOpenRef = useRef(onOpenPage);
  const onCreateRef = useRef(onCreateChild);
  const resolveTitleRef = useRef(resolvePageTitle);
  const onReadyRef = useRef(onReady);
  const onAiRef = useRef(onAi);
  const onAskRef = useRef(onAskSelection);
  onChangeRef.current = onChange;
  onOpenRef.current = onOpenPage;
  onCreateRef.current = onCreateChild;
  resolveTitleRef.current = resolvePageTitle;
  onReadyRef.current = onReady;
  onAiRef.current = onAi;
  onAskRef.current = onAskSelection;
  const onUploadRef = useRef(onUploadFile);
  const onUploadErrorRef = useRef(onUploadError);
  const onOpenFileRef = useRef(onOpenFile);
  onUploadRef.current = onUploadFile;
  onUploadErrorRef.current = onUploadError;
  onOpenFileRef.current = onOpenFile;
  const onConfirmDeleteRef = useRef(onConfirmDeleteFile);
  onConfirmDeleteRef.current = onConfirmDeleteFile;
  const pageIdRef = useRef(pageId);
  pageIdRef.current = pageId;
  const onTodoDetailRef = useRef(onTodoDetail);
  onTodoDetailRef.current = onTodoDetail;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const initialRef = useRef(doc);
  const inlineToolbar = embed ? ["link", "bold", "italic"] : inlineTools;
  const history = useDocHistory();
  /** 撤销 / 重做期间由我们自己渲染，别把这一次变更又记进历史栈 */
  const applyingRef = useRef(false);
  const onHistoryRef = useRef(onHistory);
  onHistoryRef.current = onHistory;
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});
  /** 刚删掉块时给的撤销提示：误删之后底栏可能已经收起，得有个不用找按钮的入口 */
  const [removedToast, setRemovedToast] = useState<{ count: number } | null>(null);
  const blockCountRef = useRef(doc.blocks?.length ?? 0);
  const toastTimerRef = useRef(0);
  /** 打字时节流全量 save；增删块立刻 save */
  const changeTimerRef = useRef(0);
  const CHANGE_SAVE_MS = 160;

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) {
      return;
    }
    let alive = true;
    const editor = new EditorJS({
      holder,
      data: initialRef.current,
      readOnly,
      // 移动端 / 嵌入态不自动聚焦，避免弹层一开就抢键盘
      autofocus: !readOnly && !isMobile && !embed,
      minHeight: embed ? 80 : 40,
      placeholder: t("blockEditor.placeholder"),
      i18n: editorI18n(),
      tools: {
        paragraph: {
          toolbox: { icon: menuIcons.text },
        },
        header: {
          class: Header,
          inlineToolbar,
          config: { placeholder: t("blockEditor.heading"), levels: [1, 2, 3], defaultLevel: 1 },
          toolbox: [
            { title: "Heading 1", icon: menuIcons.h1, data: { level: 1 } },
            { title: "Heading 2", icon: menuIcons.h2, data: { level: 2 } },
            { title: "Heading 3", icon: menuIcons.h3, data: { level: 3 } },
          ],
        },
        list: {
          class: List,
          inlineToolbar,
          toolbox: [
            { title: "Unordered List", icon: menuIcons.ul, data: { style: "unordered" } },
            { title: "Ordered List", icon: menuIcons.ol, data: { style: "ordered" } },
          ],
        },
        ...(embed
          ? {}
          : {
              todo: {
                class: TodoBlockTool as unknown as typeof Header,
                config: {
                  getPageId: () => pageIdRef.current ?? "",
                  onOpenDetail: (request: TodoBlockDetailRequest) => onTodoDetailRef.current?.(request),
                },
              },
            }),
        quote: {
          class: Quote,
          inlineToolbar,
          config: { quotePlaceholder: t("blockEditor.quote"), captionPlaceholder: t("blockEditor.caption") },
          toolbox: { icon: menuIcons.quote },
        },
        delimiter: {
          class: Delimiter,
          toolbox: { icon: menuIcons.line },
        },
        code: {
          class: CodeBlockTool as unknown as typeof Header,
        },
        table: {
          class: Table as unknown as typeof Header,
          inlineToolbar,
          toolbox: { icon: menuIcons.table },
        },
        ...(embed
          ? {}
          : {
              askAi: {
                class: AskAiInlineTool as unknown as typeof Header,
                config: {
                  onAsk: (text: string) => onAskRef.current?.(text),
                },
              },
              pageLink: {
                class: PageLinkTool as unknown as typeof Header,
                config: {
                  onOpen: (page: PageLinkData) => onOpenRef.current?.(page.pageId),
                  resolveTitle: (pageId: string) => resolveTitleRef.current?.(pageId),
                  createChild: () => {
                    const create = onCreateRef.current;
                    if (!create) {
                      return Promise.reject(new Error("无法创建子页面"));
                    }
                    return create();
                  },
                },
              },
            }),
        image: {
          class: ImageBlockTool as unknown as typeof Header,
          config: {
            upload: (file: File) => {
              const upload = onUploadRef.current;
              return upload ? upload(file) : Promise.reject(new Error(t("attachment.uploadFailed")));
            },
          },
        },
        video: {
          class: VideoBlockTool as unknown as typeof Header,
        },
        attachment: {
          class: AttachmentTool as unknown as typeof Header,
          config: {
            upload: (file: File) => {
              const upload = onUploadRef.current;
              return upload ? upload(file) : Promise.reject(new Error(t("attachment.uploadFailed")));
            },
            onOpen: (data: AttachmentData, replace: (next: AttachmentData) => void) => onOpenFileRef.current?.(data, replace),
            confirmDelete: (name: string) => onConfirmDeleteRef.current?.(name) ?? Promise.resolve(true),
          },
        },
        ...(embed
          ? {}
          : {
              aiAssist: {
                class: AiAssistTriggerTool as unknown as typeof Header,
                config: {
                  onInvoke: ({ blockIndex }: { blockIndex: number }) => onAiRef.current?.(blockIndex),
                },
              },
            }),
      },
      onReady() {
        new DragDrop(editor, "2px solid #191919");
        readyRef.current = true;
        editorInstanceRef.current = editor;
        // 打开时的内容就是历史起点：撤销不会撤到上一页去
        history.reset(initialRef.current);
        blockCountRef.current = editor.blocks.getBlocksCount();
        setReady(true);
        onReadyRef.current?.(editor);
        const pending = revealRef.current;
        if (pending?.text) {
          window.setTimeout(() => revealText(holder, pending.text), 60);
        }
      },
      onChange(api) {
        if (!alive) {
          return;
        }
        const count = api.blocks.getBlocksCount();
        const structural = count !== blockCountRef.current;
        const flush = () => {
          window.clearTimeout(changeTimerRef.current);
          changeTimerRef.current = 0;
          void api.saver.save().then((raw) => {
            if (!alive) {
              return;
            }
            const saved = raw as EditorJsDocument;
            onChangeRef.current(saved);
            // 撤销 / 重做是我们自己 render 回去的，不能又记一笔
            if (!applyingRef.current) {
              history.commit(saved);
              const before = blockCountRef.current;
              const after = saved.blocks.length;
              blockCountRef.current = after;
              // 块变少了就是删除：弹一条「撤销」，底栏收起来也还能救回来
              if (after < before) {
                setRemovedToast({ count: before - after });
                window.clearTimeout(toastTimerRef.current);
                toastTimerRef.current = window.setTimeout(() => setRemovedToast(null), 6000);
              }
            } else {
              blockCountRef.current = saved.blocks.length;
            }
          });
        };
        // 结构变化或撤销回放：立刻落盘；纯打字节流，少做昂贵的整篇 save
        if (structural || applyingRef.current) {
          flush();
          return;
        }
        window.clearTimeout(changeTimerRef.current);
        changeTimerRef.current = window.setTimeout(flush, CHANGE_SAVE_MS);
      },
    });

    const unbindGuards = bindEditingGuards(holder, editor);
    const unbindToolbar = bindToolbarAnchor(holder);

    const unbindPaste = bindPaste(holder, editor, {
      isAlive: () => alive,
      isReadOnly: () => readOnlyRef.current,
      getUpload: () => onUploadRef.current,
      onUploadError: (error) => onUploadErrorRef.current?.(error instanceof Error ? error.message : t("attachment.uploadFailed")),
    });

    let destroyed = false;
    const destroy = () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      void editor.isReady.then(() => editor.destroy()).catch(() => undefined);
    };

    return () => {
      alive = false;
      unbindGuards();
      unbindToolbar();
      unbindPaste();
      window.clearTimeout(toastTimerRef.current);
      window.clearTimeout(changeTimerRef.current);
      changeTimerRef.current = 0;
      onReadyRef.current?.(null);
      onHistoryRef.current?.(null);
      editorInstanceRef.current = null;
      setReady(false);
      destroy();
    };
  }, []);

  /**
   * 兜底：键盘已经弹起、焦点也确实在编辑器里，但 focusin 没被捕获到时，
   * 底栏不该缺席（用户预期“键盘一弹就在键盘上方出现”）。
   */
  useEffect(() => {
    if (!keyboardOpen) {
      return;
    }
    const active = document.activeElement;
    if (active && holderRef.current?.contains(active)) {
      setEditing(true);
    }
  }, [keyboardOpen]);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || !readyRef.current || !reveal?.text) {
      return;
    }
    const timer = window.setTimeout(() => revealText(holder, reveal.text), 60);
    return () => window.clearTimeout(timer);
  }, [reveal?.nonce, reveal?.text]);

  /** 把光标放回当前块。setToBlock 会同步更新 currentBlock，块菜单才知道对谁生效 */
  function focusCurrentBlock(): boolean {
    const editor = editorInstanceRef.current;
    if (!editor) {
      return false;
    }
    try {
      const current = editor.blocks.getCurrentBlockIndex();
      const target = current >= 0 ? current : editor.blocks.getBlocksCount() - 1;
      if (target < 0) {
        return false;
      }
      editor.caret.setToBlock(target, "end");
      return true;
    } catch {
      return false;
    }
  }

  /** 「+」：插入块。走 Editor.js 官方 API，比点 DOM 更稳（内部会先 moveAndOpen 定位工具栏） */
  function openBlockMenu() {
    const editor = editorInstanceRef.current;
    if (!editor || !focusCurrentBlock()) {
      return;
    }
    editor.toolbar.toggleToolbox(true);
  }

  /** 读当前块的样式，用于底栏高亮 */
  function refreshBlockKind() {
    const editor = editorInstanceRef.current;
    if (!editor) {
      return;
    }
    try {
      const index = editor.blocks.getCurrentBlockIndex();
      const block = index >= 0 ? editor.blocks.getBlockByIndex(index) : undefined;
      setBlockKind(block ? blockIconKey(block.holder) : "T");
    } catch {
      setBlockKind("T");
    }
  }

  /** 底栏样式图标：直接把当前块转成目标类型（走官方 convert，文本由 conversionConfig 带过去） */
  function applyBlockStyle(tool: string, data?: Record<string, unknown>) {
    const editor = editorInstanceRef.current;
    if (!editor) {
      return;
    }
    try {
      const index = editor.blocks.getCurrentBlockIndex();
      const block = index >= 0 ? editor.blocks.getBlockByIndex(index) : undefined;
      if (!block) {
        return;
      }
      // 换块时旧块的 DOM 会被拿掉，焦点一定会短暂丢失；这段时间别让底栏以为用户收起了键盘
      switchingRef.current = true;
      void editor.blocks
        .convert(block.id, tool, data)
        .then((next) => {
          try {
            editor.caret.setToBlock(next.id, "end");
          } catch {
            /* 转换后光标放不回去就算了 */
          }
          switchingRef.current = false;
          setEditing(true);
          refreshBlockKind();
        })
        .catch(() => {
          switchingRef.current = false;
          setEditing(true);
        });
    } catch {
      switchingRef.current = false;
      /* 该类型不支持相互转换：保持原样 */
    }
  }

  /** ⋯：块操作（删除 / 上移 / 下移）。移动端行首的 ⋮ 已经隐藏，入口挪到底栏 */
  function openBlockSettings() {
    const editor = editorInstanceRef.current;
    if (!editor || !focusCurrentBlock()) {
      return;
    }
    editor.toolbar.toggleBlockSettings(true);
  }

  /** 把历史里的整份文档渲染回去（撤销 / 重做共用） */
  function applyHistory(body: EditorJsDocument | null) {
    const editor = editorInstanceRef.current;
    const holder = holderRef.current;
    if (!editor || !body) {
      return;
    }
    const hadFocus = Boolean(holder && document.activeElement && holder.contains(document.activeElement));
    let at = -1;
    try {
      at = editor.blocks.getCurrentBlockIndex();
    } catch {
      at = -1;
    }
    applyingRef.current = true;
    void editor.isReady
      .then(() => editor.render(body))
      .catch(() => undefined)
      .then(() => {
        applyingRef.current = false;
        // render 是程序化写入，Editor.js 不一定触发 onChange，这里主动通知外层落盘
        onChangeRef.current(body);
        blockCountRef.current = body.blocks.length;
        if (hadFocus) {
          // 尽量回到撤销前所在的那一块，超出范围就落到最后一块
          try {
            const last = editor.blocks.getBlocksCount() - 1;
            if (last >= 0) {
              editor.caret.setToBlock(Math.min(Math.max(at, 0), last), "end");
            }
          } catch {
            /* 光标放不回去就算了 */
          }
        }
        refreshBlockKind();
      });
  }

  function handleUndo() {
    if (readOnlyRef.current) {
      return;
    }
    applyHistory(history.undo());
  }

  function handleRedo() {
    if (readOnlyRef.current) {
      return;
    }
    applyHistory(history.redo());
  }
  undoRef.current = handleUndo;
  redoRef.current = handleRedo;

  /** 顶栏按钮要知道现在能不能撤 / 能不能重做 */
  useEffect(() => {
    onHistoryRef.current?.({
      undo: () => undoRef.current(),
      redo: () => redoRef.current(),
      canUndo: history.canUndo,
      canRedo: history.canRedo,
    });
  }, [history.canUndo, history.canRedo]);

  /** 呼出 AI */
  function openAi() {
    const editor = editorInstanceRef.current;
    if (!editor) {
      return;
    }
    let index: number;
    try {
      index = Math.max(0, editor.blocks.getCurrentBlockIndex());
    } catch {
      index = 0;
    }
    onAiRef.current?.(index);
  }

  /* 光标在块之间移动时刷新底栏的样式高亮 */
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || !ready) {
      return;
    }
    const refresh = () => refreshBlockKind();
    holder.addEventListener("keyup", refresh);
    holder.addEventListener("mouseup", refresh);
    holder.addEventListener("focusin", refresh);
    return () => {
      holder.removeEventListener("keyup", refresh);
      holder.removeEventListener("mouseup", refresh);
      holder.removeEventListener("focusin", refresh);
    };
  }, [ready]);

  /* 放在所有 useState 之后：压缩后如果提前引用会命中 TDZ（Cannot access before initialization） */
  const showBar = isMobile && ready && !readOnly && editing && Boolean(barSlot);
  /* 提示条贴着可视视口底部；键盘开着时让出底栏的高度 */
  const toastBottom = viewport.top + viewport.height - (keyboardOpen ? 56 : 16);

  return (
    <>
      <div
        className={cn(
          "notion-editor",
          embed
            ? "notion-editor--embed max-w-none"
            : "mx-auto max-w-3xl pt-4 px-4 pb-6 sm:pt-6 sm:pr-6 sm:pb-20 sm:pl-20",
          className,
        )}
        /* 横屏刘海：正文左右也避开非安全区（竖屏 env() 为 0，等价 px-4） */
        style={
          isMobile && !embed
            ? {
                paddingLeft: "max(1rem, env(safe-area-inset-left))",
                paddingRight: "max(1rem, env(safe-area-inset-right))",
              }
            : undefined
        }
        onFocusCapture={() => setEditing(true)}
        onBlurCapture={(event) => {
          const next = event.relatedTarget as Node | null;
          // 换块过程中焦点必然短暂丢失，此时不能把底栏收起来（否则键盘会跟着掉）
          if (switchingRef.current) {
            return;
          }
          // 焦点落到底部工具栏（部分浏览器 pointerdown 兜不住）时不算离开编辑器
          if (!next || (!event.currentTarget.contains(next) && !barRef.current?.contains(next))) {
            setEditing(false);
          }
        }}
        ref={holderRef}
      />
      {!embed && !isMobile && ready ? <HeadingOutline root={holderRef.current} /> : null}
      {removedToast && !readOnly
        ? createPortal(
            <BlockRemovedToast
              count={removedToast.count}
              top={toastBottom}
              onUndo={() => {
                setRemovedToast(null);
                window.clearTimeout(toastTimerRef.current);
                handleUndo();
              }}
              onClose={() => {
                setRemovedToast(null);
                window.clearTimeout(toastTimerRef.current);
              }}
            />,
            document.body,
          )
        : null}
      {showBar && barSlot
        ? createPortal(
            <MobileBlockBar
              barRef={barRef}
              keyboardOpen={keyboardOpen}
              embed={embed}
              blockKind={blockKind}
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onInsert={openBlockMenu}
              onStyle={applyBlockStyle}
              onAi={openAi}
              onSettings={openBlockSettings}
            />,
            barSlot,
          )
        : null}
    </>
  );
}
