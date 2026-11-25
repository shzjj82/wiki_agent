import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type EditorJS from "@editorjs/editorjs";
import { useTranslation } from "react-i18next";
import type { EditorJsBlock, EditorJsDocument } from "@myblog/shared";
import type { PageLinkData } from "@/components/block-editor/tools/PageLinkTool";
import { imageBlockData } from "@/components/block-editor/tools/ImageBlockTool";
import { setAppLocale, type AppLocale } from "@/i18n";
import type { ExportFormat } from "@/lib/document/export";
import { fileKind, isImageFile } from "@/lib/document/fileKinds";
import { importSpreadsheet, importVideo, importWord, mergeImported, readInsertable } from "@/lib/document/import";
import { insertEditorBlocksAt } from "@/lib/document/insertBlocks";
import type { ImportChoice } from "@/components/import-dialog";
import { openLocateUrl, runLocate } from "@/lib/locate/run";
import { pageTarget, textInPage, type LocateTarget } from "@/lib/locate/target";
import { writeAppLocation } from "@/lib/route";
import { useWorkspace } from "@/layouts/workspace/context";
import {
  createLocal,
  listLocal,
  loadLocal,
  removeLocal,
  reparentLocal,
  retitlePageLink,
  saveLocal,
  titleFromBody,
  withLivePageLinks,
  type EditorPage,
} from "@/store/localStore";
import { bindTodoPage, pageIdFromTodo, rememberTodoPage, todoNeedsPageBind, type NotifyTodo } from "@/store/notifyStore";
import { createRemote, listRemote, loadRemote, removeRemote, reparentRemote, saveRemote, type RemoteSession } from "@/store/remoteStore";
import { canWriteTeam, writeActiveTeamId } from "@/store/teamStore";
import { promoteAttachment, promoteDocument, saveAttachment, type AttachmentData } from "@/store/fileStore";
import { mergeDocuments, sameDocument, type ConflictChoice, type MergeResult } from "@/lib/document/merge";

type HistoryMode = "push" | "replace" | "none";
/** 服务端上我们最后见过的那一版，三方合并的 base */
type BaseVersion = { id: string; updatedAt: string; body: EditorJsDocument };
export type SaveConflict = { mine: EditorPage; latest: EditorPage; result: MergeResult };

/** 团队文章没有输入时多久看一次远端 */
const PULL_MS = 20_000;
type PendingDrop = { file: File; index: number | null };
type ViewingFile = { data: AttachmentData; replace: (next: AttachmentData) => void };
type FileDeleteAsk = { name: string; resolve: (ok: boolean) => void };

/**
 * 打开、保存、导入和拖放都围着同一篇文档转，收在这里，外壳只负责摆界面。
 * 导入、删除确认、附件预览这些只跟当前文档有关的状态也放在这里；
 * 登录、页面树、团队和提示条从 WorkspaceLayout 取。
 */
export function usePageActions({
  page,
  setPage,
  pageRef,
  draftDirtyRef,
  editorRef,
  editorReady,
  readOnlyRef,
  refreshLocal,
  refreshRemote,
  setEmptyTeamId,
}: {
  page: EditorPage | null;
  setPage: Dispatch<SetStateAction<EditorPage | null>>;
  pageRef: MutableRefObject<EditorPage | null>;
  draftDirtyRef: MutableRefObject<boolean>;
  editorRef: MutableRefObject<EditorJS | null>;
  editorReady: boolean;
  readOnlyRef: MutableRefObject<boolean>;
  refreshLocal: (selectId?: string | null, history?: "push" | "replace") => void;
  refreshRemote: (nextSession: RemoteSession, selectId?: string | null, history?: "push" | "replace") => Promise<void>;
  setEmptyTeamId: Dispatch<SetStateAction<string | null>>;
}) {
  const { t } = useTranslation();
  const { session, sessionRef, nodes, setNodes, teams, activeTeamId, setActiveTeamId, setSidebarOpen, setError, setHint } = useWorkspace();
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [queuedDrop, setQueuedDrop] = useState<File[] | null>(null);
  const [viewing, setViewing] = useState<ViewingFile | null>(null);
  const [fileDeleteAsk, setFileDeleteAsk] = useState<FileDeleteAsk | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ text: string; nonce: number } | null>(null);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const saveTimer = useRef(0);
  const baseRef = useRef<BaseVersion | null>(null);
  /** 保存串行执行，后一次要拿前一次保存后的 base 做比较 */
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const [conflict, setConflict] = useState<SaveConflict | null>(null);
  const conflictRef = useRef<SaveConflict | null>(null);
  const openPageRef = useRef<(id: string, history?: HistoryMode) => Promise<void>>(async () => undefined);

  /** 退出或换号后，还在路上的云端响应不能再写回界面 */
  const stale = (nextSession: RemoteSession) => sessionRef.current !== nextSession;

  /** 空白团队页盖在当前文档上。等新页面进状态后再揭开，避免先闪出上一页再变成空白页。 */
  function revealDocument() {
    setEmptyTeamId(null);
  }

  function patchSidebarNode(next: EditorPage) {
    setNodes((prev) => {
      let changed = false;
      const mapped = prev.map((node) => {
        if (node.id !== next.id) {
          return node;
        }
        if (
          node.title === next.title &&
          node.updatedAt === next.updatedAt &&
          node.parentId === next.parentId &&
          (node.teamId ?? null) === (next.teamId ?? null)
        ) {
          return node;
        }
        changed = true;
        return {
          id: next.id,
          title: next.title,
          parentId: next.parentId,
          updatedAt: next.updatedAt,
          teamId: next.teamId,
        };
      });
      return changed ? mapped : prev;
    });
  }

  async function mirrorParentLink(active: RemoteSession, child: EditorPage) {
    if (!child.parentId || pageRef.current?.id === child.parentId) {
      return;
    }
    const parent = await loadRemote(active, child.parentId);
    const body = retitlePageLink(parent.body, child.id, child.title);
    if (!body) {
      return;
    }
    await saveRemote(active, { ...parent, body });
  }

  useEffect(() => {
    if (page && session && !draftDirtyRef.current) {
      baseRef.current = { id: page.id, updatedAt: page.updatedAt, body: page.body };
    }
    // draftDirtyRef 是 ref，只在 page 换了的时候看一眼
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, session]);

  /** 把远端版本换进编辑器；正在输入时编辑器会重建，光标会丢，所以只在合并或空闲时调用 */
  function showRemote(next: EditorPage, dirty: boolean) {
    draftDirtyRef.current = dirty;
    pageRef.current = next;
    setPage(next);
    setEditorEpoch((value) => value + 1);
    patchSidebarNode(next);
  }

  function persist(next: EditorPage): Promise<boolean> {
    const run = saveChain.current.then(() => persistNow(next));
    saveChain.current = run.catch(() => undefined);
    return run;
  }

  /**
   * 团队文章保存前先看远端有没有被别人改过（updatedAt 变了且正文不同）：
   * 没改直接存；改了就按块三方合并，没冲突自动合并后再存，有冲突停下来让人选。
   */
  async function persistNow(next: EditorPage): Promise<boolean> {
    if (conflictRef.current) {
      return false;
    }
    const viewingId = pageRef.current?.id;
    try {
      if (!session) {
        const saved = saveLocal(next);
        if (pageRef.current?.id === viewingId && viewingId === next.id) {
          draftDirtyRef.current = false;
          pageRef.current = saved;
          setPage(saved);
        }
        patchSidebarNode(saved);
      } else {
        let { body } = await promoteDocument(session, next.body);
        let merged = false;
        const base = baseRef.current;
        if (next.teamId && base?.id === next.id) {
          const latest = await loadRemote(session, next.id);
          if (stale(session)) {
            return true;
          }
          if (latest.updatedAt !== base.updatedAt && !sameDocument(latest.body, base.body)) {
            const result = mergeDocuments(base.body, body, latest.body);
            if (result.conflicts.length > 0) {
              window.clearTimeout(saveTimer.current);
              const found = { mine: { ...next, body }, latest, result };
              conflictRef.current = found;
              setConflict(found);
              setHint("");
              return false;
            }
            body = result.build();
            merged = true;
          }
        }
        const previousTitle = base?.id === next.id ? titleFromBody(base.body) : null;
        const saved = await saveRemote(session, { ...next, body, title: titleFromBody(body) });
        // 父页面里的子页面块只在标题变了才要改。每次保存都去 GET 父页面是多余的。
        const titleChanged = previousTitle === null || previousTitle !== saved.title;
        if (saved.parentId && pageRef.current?.id !== saved.parentId && titleChanged) {
          await mirrorParentLink(session, saved).catch(() => undefined);
        }
        if (stale(session)) {
          return true;
        }
        baseRef.current = { id: saved.id, updatedAt: saved.updatedAt, body: saved.body };
        if (pageRef.current?.id === next.id && merged) {
          // 存的这段时间里可能又输入了，把这部分叠到合并结果上再放回编辑器
          const typed = editorRef.current ? ((await editorRef.current.save()) as EditorJsDocument) : next.body;
          const shown = mergeDocuments(next.body, typed, saved.body).build();
          const dirty = !sameDocument(shown, saved.body);
          showRemote({ ...saved, body: shown, title: titleFromBody(shown) }, dirty);
          if (dirty) {
            onEdit(shown);
          }
          setHint(t("collab.merged"));
          setError("");
          return true;
        }
        if (pageRef.current?.id === next.id) {
          draftDirtyRef.current = false;
          pageRef.current = saved;
          setPage(saved);
        }
        patchSidebarNode(saved);
      }
      setHint(t("app.saved"));
      setError("");
      return true;
    } catch (err) {
      setHint("");
      setError(err instanceof Error ? err.message : t("app.failedToSave"));
      return false;
    }
  }

  /** 切页前先落盘，避免子页面标题还在防抖里、父页面读到旧名称 */
  async function flushEditing() {
    const current = pageRef.current;
    const editor = editorRef.current;
    if (!current || !editor) {
      return;
    }
    window.clearTimeout(saveTimer.current);
    const body = (await editor.save()) as EditorJsDocument;
    window.clearTimeout(saveTimer.current);
    await persist({ ...current, body, title: titleFromBody(body) });
    window.clearTimeout(saveTimer.current);
  }

  async function openPage(id: string, history: HistoryMode = "push") {
    setSidebarOpen(false);
    if (history !== "none") {
      writeAppLocation(id, pageRef.current?.id === id ? "replace" : history);
    }
    setError("");
    setReveal(null);
    if (pageRef.current?.id !== id) {
      await flushEditing();
    }
    if (!session) {
      const loaded = loadLocal(id);
      if (!loaded) {
        refreshLocal(null, "replace");
        return;
      }
      const healed = withLivePageLinks(loaded, listLocal());
      setPage(healed);
      revealDocument();
      if (healed !== loaded) {
        saveLocal(healed);
        setNodes(listLocal());
      }
      return;
    }
    const list = await listRemote(session);
    if (stale(session)) {
      return;
    }
    if (!list.some((node) => node.id === id)) {
      await refreshRemote(session, null, "replace");
      return;
    }
    const loaded = await loadRemote(session, id);
    if (stale(session)) {
      return;
    }
    const healed = withLivePageLinks(loaded, list);
    setNodes(list);
    setPage(healed);
    revealDocument();
    if (healed !== loaded) {
      void saveRemote(session, healed).catch(() => undefined);
    }
  }
  openPageRef.current = openPage;

  async function createChildLink(): Promise<PageLinkData> {
    const parentId = pageRef.current?.id ?? null;
    if (!session) {
      const created = createLocal(parentId);
      setNodes(listLocal());
      return { pageId: created.id, slug: created.id, title: created.title };
    }
    const created = await createRemote(session, parentId);
    setNodes(await listRemote(session));
    return { pageId: created.id, slug: created.id, title: created.title };
  }

  /** 在父页面正文末尾补一个子页面链接；父页面正打开时先取编辑器里未保存的内容 */
  async function appendChildLink(parentId: string, link: PageLinkData) {
    const current = pageRef.current?.id === parentId ? pageRef.current : null;
    let body: EditorJsDocument | undefined;
    if (current && editorRef.current) {
      window.clearTimeout(saveTimer.current);
      body = (await editorRef.current.save()) as EditorJsDocument;
    }
    const block = { type: "pageLink", data: link };
    if (!session) {
      const parent = current ?? loadLocal(parentId);
      if (parent) {
        saveLocal({ ...parent, body: { ...(body ?? parent.body), blocks: [...(body ?? parent.body).blocks, block] } });
      }
      return;
    }
    const parent = current ?? (await loadRemote(session, parentId));
    await saveRemote(session, { ...parent, body: { ...(body ?? parent.body), blocks: [...(body ?? parent.body).blocks, block] } });
  }

  async function createPage(parentId: string | null, teamId?: string | null) {
    setError("");
    try {
      const inherited = parentId ? (nodes.find((node) => node.id === parentId)?.teamId ?? null) : null;
      const preferredTeam = teamId !== undefined ? teamId : activeTeamId;
      const writingTeam =
        !parentId && preferredTeam && canWriteTeam(teams.find((team) => team.id === preferredTeam)?.role) ? preferredTeam : null;
      if (teamId !== undefined) {
        writeActiveTeamId(teamId);
        setActiveTeamId(teamId);
      }
      const created = session ? await createRemote(session, parentId, inherited || writingTeam) : createLocal(parentId);
      if (parentId) {
        await appendChildLink(parentId, { pageId: created.id, slug: created.id, title: created.title });
      }
      if (session) {
        await refreshRemote(session, created.id, "push");
      } else {
        refreshLocal(created.id, "push");
      }
      revealDocument();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("app.failedToCreatePage"));
    }
  }

  /** 打开待办关联的文档。历史无页待办先补绑当前页或本机记住的页面，再跳转 */
  async function writeTodoPage(todo: NotifyTodo) {
    if (!session) {
      throw new Error(t("notify.actionFailed"));
    }
    setError("");
    let pageId = pageIdFromTodo(todo);
    if (!pageId && todo.data?.legacyWithoutPage) {
      pageId = pageRef.current?.id ?? null;
    }
    if (!pageId) {
      throw new Error(t("notify.pageMissing"));
    }
    if (todoNeedsPageBind(todo)) {
      await bindTodoPage(session, todo.id, pageId);
    }
    rememberTodoPage(todo.id, pageId);
    await locate(pageTarget(pageId));
  }

  function onEdit(body: EditorJsDocument) {
    const current = pageRef.current;
    if (!current || readOnlyRef.current) {
      return;
    }
    const title = titleFromBody(body);
    const next = { ...current, body, title };
    draftDirtyRef.current = true;
    pageRef.current = next;
    if (title !== current.title) {
      setPage(next);
      setNodes((prev) => prev.map((node) => (node.id === next.id ? { ...node, title: next.title } : node)));
    }
    window.clearTimeout(saveTimer.current);
    if (conflictRef.current) {
      return;
    }
    setHint((prev) => (prev === t("app.saving") ? prev : t("app.saving")));
    saveTimer.current = window.setTimeout(() => void persist(next), 700);
  }

  async function readImport(file: File) {
    setError("");
    setPendingDrop({ file, index: null });
    setImportOpen(true);
  }

  function closeImport() {
    if (importBusy) {
      return;
    }
    setImportOpen(false);
    setPendingDrop(null);
  }

  async function uploadFile(file: File): Promise<AttachmentData> {
    const { data, localOnly } = await saveAttachment(session, file);
    if (localOnly) {
      setHint(t("attachment.savedLocally"));
    }
    return data;
  }

  function confirmDeleteFile(name: string): Promise<boolean> {
    return new Promise((resolve) => setFileDeleteAsk({ name, resolve }));
  }

  function answerDeleteFile(ok: boolean) {
    fileDeleteAsk?.resolve(ok);
    setFileDeleteAsk(null);
  }

  /** 上传服务当时不可用而存在本机的附件，打开时再补传一次，成功后块数据改指向云端 */
  async function promoteViewing(blob: Blob) {
    const current = viewing;
    if (!session || !current || current.data.source !== "local") {
      return;
    }
    const next = await promoteAttachment(session, current.data, blob).catch(() => null);
    if (next) {
      current.replace(next);
      setHint(t("attachment.promoted"));
    }
  }

  /** 按松手位置落在哪个块的上半或下半，算出插入下标；标题块始终在最前 */
  function dropIndex(point: { x: number; y: number } | null): number {
    const editor = editorRef.current;
    if (!editor) {
      return 0;
    }
    const total = editor.blocks.getBlocksCount();
    const floor = editor.blocks.getBlockByIndex(0)?.name === "header" ? 1 : 0;
    const target = point ? document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>(".ce-block") : null;
    const blocks = Array.from(document.querySelectorAll<HTMLElement>(".notion-editor .ce-block"));
    const at = target ? blocks.indexOf(target) : -1;
    if (at < 0) {
      return total;
    }
    const rect = target!.getBoundingClientRect();
    return Math.max(floor, point!.y > rect.top + rect.height / 2 ? at + 1 : at);
  }

  /** 拖入：Markdown / 文本转成正文，图片插入为图片，Word、PDF、Excel、视频、代码作为附件，其他提示不支持 */
  async function insertDropped(files: File[], index: number) {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const blocks: EditorJsBlock[] = [];
    const skipped: string[] = [];
    setHint(t("attachment.processing"));
    try {
      for (const file of files) {
        const content = await readInsertable(file);
        if (isImageFile(file)) {
          blocks.push({ type: "image", data: imageBlockData(await uploadFile(file)) });
        } else if (content) {
          blocks.push(...content);
        } else if (fileKind(file.name)) {
          blocks.push({ type: "attachment", data: await uploadFile(file) });
        } else {
          skipped.push(file.name);
        }
      }
      await insertEditorBlocksAt(editor, blocks, index);
      setHint("");
      if (skipped.length > 0) {
        setError(t("attachment.unsupported", { name: skipped.join(t("common.listSeparator")) }));
      }
    } catch (err) {
      setHint("");
      setError(err instanceof Error ? err.message : t("attachment.uploadFailed"));
    }
  }

  async function applyImport(mode: ImportChoice) {
    const current = pageRef.current;
    const drop = pendingDrop;
    if (!drop || !current) {
      return;
    }
    setImportBusy(true);
    setError("");
    try {
      if (mode === "attach") {
        await insertDropped([drop.file], drop.index ?? dropIndex(null));
      } else {
        const kind = fileKind(drop.file.name);
        const imported =
          kind === "excel"
            ? await importSpreadsheet(drop.file)
            : kind === "video"
              ? await importVideo(drop.file, uploadFile)
              : await importWord(drop.file, uploadFile);
        const body = editorRef.current ? ((await editorRef.current.save()) as EditorJsDocument) : current.body;
        onEdit(mergeImported(mode, body, imported));
        setEditorEpoch((value) => value + 1);
      }
      setImportOpen(false);
      setPendingDrop(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("app.importFailed"));
    } finally {
      setImportBusy(false);
    }
  }

  async function dropFiles(files: File[], point: { x: number; y: number } | null) {
    setError("");
    if (!pageRef.current || !editorRef.current) {
      setQueuedDrop(files);
      await createPage(null);
      return;
    }
    const index = dropIndex(point);
    const [single] = files;
    const kind = single && files.length === 1 ? fileKind(single.name) : null;
    if (single && (kind === "word" || kind === "excel" || kind === "video")) {
      setPendingDrop({ file: single, index });
      setImportOpen(true);
      return;
    }
    await insertDropped(files, index);
  }

  useEffect(() => {
    if (queuedDrop && editorReady && page) {
      setQueuedDrop(null);
      void dropFiles(queuedDrop, null);
    }
    // 只在编辑器就绪或换页后补插刚才排队的文件，不跟着手势函数重建。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedDrop, editorReady, page?.id]);

  async function exportPage(id: string, format: ExportFormat) {
    setError("");
    try {
      let body: EditorJsDocument | undefined;
      if (page?.id === id && editorRef.current) {
        body = (await editorRef.current.save()) as EditorJsDocument;
      } else if (session) {
        body = (await loadRemote(session, id)).body;
      } else {
        body = loadLocal(id)?.body;
      }
      if (!body) {
        throw new Error(t("app.pageNotFound"));
      }
      const { exportDocument } = await import("@/lib/document/export");
      await exportDocument(format, titleFromBody(body), body);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("app.exportFailed"));
    }
  }

  async function locate(target: LocateTarget) {
    await runLocate(target, {
      openPage: (pageId, history) => openPage(pageId, history),
      revealText: (text) => setReveal({ text, nonce: Date.now() }),
      openUrl: openLocateUrl,
    });
  }

  async function revealPage(id: string, query: string) {
    await locate(textInPage(id, query));
  }

  /** 编辑器会按新语言重建，先把编辑器里的最新内容存下来 */
  async function switchLocale(locale: AppLocale) {
    const current = pageRef.current;
    if (current && editorRef.current) {
      window.clearTimeout(saveTimer.current);
      const body = (await editorRef.current.save()) as EditorJsDocument;
      if (!(await persist({ ...current, body, title: titleFromBody(body) }))) {
        return;
      }
    }
    await setAppLocale(locale);
    setHint("");
    setError("");
  }

  function descendantIds(rootId: string): string[] {
    const drop = new Set<string>([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const node of nodes) {
        if (node.parentId && drop.has(node.parentId) && !drop.has(node.id)) {
          drop.add(node.id);
          grew = true;
        }
      }
    }
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const depthOf = (id: string) => {
      let depth = 0;
      let current = byId.get(id);
      const seen = new Set<string>();
      while (current?.parentId && !seen.has(current.id)) {
        seen.add(current.id);
        depth += 1;
        current = byId.get(current.parentId);
      }
      return depth;
    };
    return [...drop].sort((a, b) => depthOf(b) - depthOf(a));
  }

  async function movePage(id: string, parentId: string | null) {
    const currentId = pageRef.current?.id ?? null;
    const source = nodes.find((node) => node.id === id);
    const touched = new Set([id, parentId, source?.parentId ?? null]);
    setError("");
    try {
      if (!session) {
        reparentLocal(id, parentId);
        if (currentId && currentId !== id && touched.has(currentId)) {
          setEditorEpoch((value) => value + 1);
        }
        refreshLocal(currentId);
        return;
      }
      await reparentRemote(session, id, parentId);
      if (currentId && currentId !== id && touched.has(currentId)) {
        setEditorEpoch((value) => value + 1);
      }
      await refreshRemote(session, currentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("app.failedToMovePage"));
    }
  }

  function removePage(id: string) {
    setPendingDeleteId(id);
  }

  async function confirmRemove() {
    const id = pendingDeleteId;
    if (!id) {
      return;
    }
    setPendingDeleteId(null);
    setError("");
    try {
      if (!session) {
        removeLocal(id);
        setPage(null);
        refreshLocal(null);
        return;
      }
      for (const targetId of descendantIds(id)) {
        await removeRemote(session, targetId);
      }
      setPage(null);
      await refreshRemote(session, null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("app.failedToDelete"));
    }
  }

  /** 冲突时选定一种取法：以对方的最新版为 base 重新保存，期间对方又改了会再合并一次 */
  async function resolveConflict(choices: Record<string, ConflictChoice>, ai: Record<string, EditorJsBlock> = {}) {
    const found = conflictRef.current;
    if (!found) {
      return;
    }
    conflictRef.current = null;
    setConflict(null);
    const body = found.result.build(choices, "ours", ai);
    const next = { ...found.mine, body, title: titleFromBody(body) };
    baseRef.current = { id: found.latest.id, updatedAt: found.latest.updatedAt, body: found.latest.body };
    const viewing = pageRef.current?.id === next.id;
    if (sameDocument(body, found.latest.body)) {
      if (viewing) {
        showRemote(found.latest, false);
      }
      setHint(t("app.saved"));
      return;
    }
    if (viewing) {
      showRemote(next, true);
    }
    setHint(t("app.saving"));
    await persist(next);
  }

  /** 团队文章：没有未保存的改动、也没在编辑器里输入时，切回窗口或定时拉一次远端，有新版本就换进来 */
  useEffect(() => {
    const id = page?.id;
    if (!session || !id || !page?.teamId) {
      return;
    }
    let busy = false;
    const pull = async () => {
      const base = baseRef.current;
      if (busy || document.hidden || conflictRef.current || draftDirtyRef.current || base?.id !== id) {
        return;
      }
      if (!readOnlyRef.current && document.activeElement?.closest(".notion-editor")) {
        return;
      }
      busy = true;
      const latest = await loadRemote(session, id).catch(() => null);
      busy = false;
      if (!latest || stale(session) || draftDirtyRef.current || pageRef.current?.id !== id || baseRef.current !== base) {
        return;
      }
      if (latest.updatedAt === base.updatedAt) {
        return;
      }
      if (sameDocument(latest.body, base.body)) {
        baseRef.current = { ...base, updatedAt: latest.updatedAt };
        return;
      }
      showRemote(latest, false);
      setHint(t("collab.pulled"));
    };
    const onVisible = () => {
      if (!document.hidden) {
        void pull();
      }
    };
    const timer = window.setInterval(() => void pull(), PULL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // 只跟着打开的团队文章走，其余都从 ref 取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, page?.id, page?.teamId]);

  return {
    openPageRef,
    conflict,
    resolveConflict,
    importState: { open: importOpen, busy: importBusy, drop: pendingDrop },
    viewing,
    setViewing,
    fileDeleteAsk,
    pendingDeleteId,
    cancelRemove: () => setPendingDeleteId(null),
    reveal,
    editorEpoch,
    openPage,
    createPage,
    createChildLink,
    writeTodoPage,
    readImport,
    closeImport,
    applyImport,
    uploadFile,
    confirmDeleteFile,
    answerDeleteFile,
    promoteViewing,
    dropFiles,
    onEdit,
    switchLocale,
    movePage,
    removePage,
    confirmRemove,
    exportPage,
    revealPage,
    locate,
  };
}
