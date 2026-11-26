import type { MutableRefObject, ReactNode } from "react";
import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Cloud, Download, Ellipsis, FileOutput, HardDrive, Menu, Redo2, Trash2, Undo2 } from "lucide-react";
import type { EditorJsDocument } from "@myblog/shared";
import type EditorJS from "@editorjs/editorjs";
import { BlockEditor, type EditorHistoryApi } from "@/components/block-editor";
import { MobileIoSheet } from "@/components/block-editor/MobileBlockBar";
import type { PageLinkData } from "@/components/block-editor/tools/PageLinkTool";
import type { TodoBlockDetailRequest } from "@/components/block-editor/tools/TodoBlockTool";
import { EmptyState } from "@/components/empty-state";
import { FileDropZone } from "@/components/file-drop";
import { FileTypeIcon } from "@/components/file-type-icon";
import { LanguageSwitch } from "@/components/language-switch";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useWorkspaceStatus } from "@/layouts/workspace/context";
import { isImportImage, partitionImportFiles } from "@/lib/document/fileKinds";
import { IMPORT_ACCEPT, IMPORT_WORD_OR_IMAGE_ACCEPT } from "@/lib/document/import";
import type { ExportFormat } from "@/lib/document/export";
import type { AppLocale } from "@/i18n";
import type { AttachmentData } from "@/store/fileStore";
import type { EditorPage, PageNode } from "@/store/localStore";

const iconProps = { size: 16 };

function MenuRow({
  icon,
  children,
  disabled,
  danger,
  onClick,
}: {
  icon?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "flex h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm disabled:pointer-events-none disabled:opacity-50",
        danger ? "text-destructive hover:bg-destructive/10" : "hover:bg-muted",
      )}
      onClick={onClick}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

type Props = {
  isMobile: boolean;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  remote: boolean;
  importInputRef: MutableRefObject<HTMLInputElement | null>;
  onImportFile: (file: File) => void;
  /** 等待同步到云端的本地页面数，0 时不显示同步按钮 */
  syncPending: number;
  onOpenSync: () => void;
  page: EditorPage | null;
  emptyTeamId: string | null;
  pageReadOnly: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  exportOpen: boolean;
  onExportOpen: (open: boolean) => void;
  onExport: (format: ExportFormat) => void;
  onDeletePage: () => void;
  onOpenWiki: () => void;
  workEnabled: boolean;
  onOpenWork: () => void;
  onSwitchLocale: (locale: AppLocale) => void;
  mobileMenuOpen: boolean;
  onMobileMenu: (open: boolean) => void;
  onDrop: (files: File[], point: { x: number; y: number } | null) => void;
  nodes: PageNode[];
  editorEpoch: number;
  language: string;
  onEdit: (body: EditorJsDocument) => void;
  onOpenPage: (id: string) => void;
  onCreateChild: () => Promise<PageLinkData>;
  resolvePageTitle: (pageId: string) => string | undefined;
  onEditorReady: (editor: EditorJS | null) => void;
  onAi: (index: number) => void;
  onAskSelection: (text: string) => void;
  onUploadFile: (file: File) => Promise<AttachmentData>;
  onUploadError: (message: string) => void;
  onOpenFile: (data: AttachmentData, replace: (next: AttachmentData) => void) => void;
  onConfirmDeleteFile: (name: string) => Promise<boolean>;
  onHistory: (api: EditorHistoryApi | null) => void;
  barSlot: HTMLDivElement | null;
  onBarSlot: (node: HTMLDivElement | null) => void;
  reveal: { text: string; nonce: number } | null;
  onTodoDetail: (request: TodoBlockDetailRequest) => void;
  onCreatePage: (parentId: string | null, teamId?: string | null) => void;
};

/** 顶栏和正文区。侧栏、登录和各种弹窗留在外壳里。 */
export function EditorWorkspace(props: Props) {
  const { t } = useTranslation();
  const { hint, error } = useWorkspaceStatus();
  const {
    isMobile,
    sidebarOpen,
    onOpenSidebar,
    remote,
    importInputRef,
    onImportFile,
    syncPending,
    onOpenSync,
    page,
    emptyTeamId,
    pageReadOnly,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    exportOpen,
    onExportOpen,
    onExport,
    onDeletePage,
    onOpenWiki,
    workEnabled,
    onOpenWork,
    onSwitchLocale,
    mobileMenuOpen,
    onMobileMenu,
    onDrop,
    nodes,
    editorEpoch,
    language,
    onEdit,
    onOpenPage,
    onCreateChild,
    resolvePageTitle,
    onEditorReady,
    onAi,
    onAskSelection,
    onUploadFile,
    onUploadError,
    onOpenFile,
    onConfirmDeleteFile,
    onHistory,
    barSlot,
    onBarSlot,
    reveal,
    onTodoDetail,
    onCreatePage,
  } = props;
  const blocked = !page || emptyTeamId !== null;
  const [ioMode, setIoMode] = useState<"export" | null>(null);
  const [importImages, setImportImages] = useState<{ files: File[]; nonce: number } | null>(null);
  const mobileImportRef = useRef<HTMLInputElement>(null);

  function takeMobileImport(files: File[]) {
    const { images, rest } = partitionImportFiles(files);
    if (images.length) {
      setImportImages({ files: images, nonce: Date.now() });
    }
    if (rest.length) {
      onDrop(rest, null);
    }
  }

  return (
    <main className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      <header
        className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 pt-2 pb-1 text-xs text-muted-foreground sm:gap-4 sm:border-b-0 sm:px-6 sm:pt-3 sm:pb-0"
        style={
          isMobile
            ? {
                paddingTop: "max(0.5rem, env(safe-area-inset-top))",
                paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
                paddingRight: "max(0.75rem, env(safe-area-inset-right))",
                touchAction: "none",
              }
            : undefined
        }
      >
        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
          {isMobile ? (
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t("app.openPageList")} aria-expanded={sidebarOpen} onClick={onOpenSidebar}>
              <Menu {...iconProps} />
            </Button>
          ) : null}
          <span className="inline-flex shrink-0 items-center gap-1.5">
            {remote ? <Cloud {...iconProps} size={14} /> : <HardDrive {...iconProps} size={14} />}
            <span className="hidden sm:inline">{remote ? t("app.remote") : t("app.local")}</span>
          </span>
          <span className={cn("min-w-0 truncate", error && "text-destructive")}>{error || hint}</span>
        </span>
        <input
          ref={(node) => {
            importInputRef.current = node;
          }}
          type="file"
          accept={IMPORT_WORD_OR_IMAGE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) {
              return;
            }
            if (isImportImage(file)) {
              setImportImages({ files: [file], nonce: Date.now() });
              return;
            }
            onImportFile(file);
          }}
        />
          <span className="hidden shrink-0 items-center gap-2 sm:inline-flex">
            {syncPending > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={onOpenSync}>
                <Cloud {...iconProps} />
                {t("common.syncLocalPages")} · {syncPending}
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="icon" aria-label={t("app.undo")} disabled={blocked || pageReadOnly || !canUndo} onClick={onUndo}>
              <Undo2 {...iconProps} />
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label={t("app.redo")} disabled={blocked || pageReadOnly || !canRedo} onClick={onRedo}>
              <Redo2 {...iconProps} />
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={blocked} onClick={() => importInputRef.current?.click()}>
              <Download {...iconProps} />
              {t("common.import")}
            </Button>
            <Popover open={exportOpen} onOpenChange={onExportOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={blocked}>
                  <FileOutput {...iconProps} />
                  {t("app.export")}
                </Button>
              </PopoverTrigger>
              <PopoverContent>
                {(["pdf", "word"] as const).map((format) => (
                  <button
                    key={format}
                    type="button"
                    className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-muted"
                    onClick={() => {
                      onExportOpen(false);
                      if (page) onExport(format);
                    }}
                  >
                    <FileTypeIcon type={format} />
                    {format === "pdf" ? t("common.exportPdf") : t("common.exportWord")}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <Button type="button" variant="outline" size="sm" disabled={blocked || pageReadOnly} onClick={onDeletePage}>
              <Trash2 {...iconProps} />
              {t("common.delete")}
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label={t("wikiAsk.title")} onClick={onOpenWiki}>
              <span className="text-[11px] font-semibold leading-none tracking-wide">AI</span>
            </Button>
            {workEnabled ? (
              <Button type="button" variant="outline" size="sm" aria-label={t("work.title")} onClick={onOpenWork}>
                {t("work.title")}
              </Button>
            ) : null}
            <LanguageSwitch onChange={onSwitchLocale} />
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 sm:hidden">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t("app.moreActions")}
              aria-expanded={mobileMenuOpen}
              onClick={() => onMobileMenu(true)}
            >
              <Ellipsis {...iconProps} />
            </Button>
            {mobileMenuOpen ? (
              <Sheet open onOpenChange={onMobileMenu}>
                <SheetContent side="bottom">
                  <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted" />
                  <SheetTitle className="px-4 py-3 text-left">{t("app.moreActions")}</SheetTitle>
                  <SheetDescription className="sr-only">{t("app.moreActions")}</SheetDescription>
                  <div className="grid px-2 pb-2">
                    {syncPending > 0 ? (
                      <>
                        <MenuRow
                          icon={<Cloud {...iconProps} />}
                          onClick={() => {
                            onMobileMenu(false);
                            onOpenSync();
                          }}
                        >
                          {t("common.syncLocalPages")} · {syncPending}
                        </MenuRow>
                        <div className="mx-3 my-1 h-px bg-border" />
                      </>
                    ) : null}
                    <MenuRow
                      icon={<Download {...iconProps} />}
                      disabled={blocked || pageReadOnly}
                      onClick={() => {
                        mobileImportRef.current?.click();
                        onMobileMenu(false);
                      }}
                    >
                      {t("common.import")}
                    </MenuRow>
                    <MenuRow
                      icon={<FileOutput {...iconProps} />}
                      disabled={blocked}
                      onClick={() => {
                        onMobileMenu(false);
                        setIoMode("export");
                      }}
                    >
                      {t("app.export")}
                    </MenuRow>
                    <MenuRow
                      icon={<Trash2 {...iconProps} />}
                      danger
                      disabled={blocked || pageReadOnly}
                      onClick={() => {
                        onMobileMenu(false);
                        if (page) onDeletePage();
                      }}
                    >
                      {t("common.delete")}
                    </MenuRow>
                    <div className="mx-3 my-1 h-px bg-border" />
                    <div className="flex h-11 items-center justify-between gap-2 px-3">
                      <span className="text-sm text-muted-foreground">{t("common.language")}</span>
                      <LanguageSwitch onChange={onSwitchLocale} />
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            ) : null}
            <Button type="button" variant="outline" size="icon" aria-label={t("wikiAsk.title")} onClick={onOpenWiki}>
              <span className="text-[11px] font-semibold leading-none tracking-wide">AI</span>
            </Button>
            {workEnabled ? (
              <Button type="button" variant="outline" size="sm" aria-label={t("work.title")} onClick={onOpenWork}>
                {t("work.title")}
              </Button>
            ) : null}
          </span>
      </header>
      <FileDropZone hasPage={Boolean(page) && !emptyTeamId} className="min-h-0 flex-1" onDrop={onDrop}>
        {emptyTeamId ? (
          <EmptyState hasPages={false} onCreate={() => onCreatePage(null, emptyTeamId)} />
        ) : page ? (
          <BlockEditor
            key={`${remote ? "remote" : "local"}:${page.id}:${editorEpoch}:${language}:${pageReadOnly ? "ro" : "rw"}`}
            doc={page.body}
            pageId={page.id}
            readOnly={pageReadOnly}
            onChange={onEdit}
            onOpenPage={onOpenPage}
            onCreateChild={onCreateChild}
            resolvePageTitle={resolvePageTitle}
            onReady={onEditorReady}
            onAi={onAi}
            onAskSelection={onAskSelection}
            onUploadFile={onUploadFile}
            onUploadError={onUploadError}
            onOpenFile={onOpenFile}
            onConfirmDeleteFile={onConfirmDeleteFile}
            onHistory={onHistory}
            barSlot={barSlot}
            importImages={importImages}
            reveal={reveal}
            onTodoDetail={onTodoDetail}
          />
        ) : (
          <EmptyState hasPages={nodes.length > 0} onCreate={() => onCreatePage(null)} />
        )}
      </FileDropZone>
      <div ref={onBarSlot} className="relative shrink-0" />
      {isMobile ? (
        <>
          <input
            ref={mobileImportRef}
            type="file"
            accept={IMPORT_ACCEPT}
            multiple
            className="sr-only"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              takeMobileImport(files);
            }}
          />
          <MobileIoSheet
            mode={ioMode}
            onClose={() => setIoMode(null)}
            onExport={(format) => {
              if (page) onExport(format);
            }}
          />
        </>
      ) : null}
    </main>
  );
}
