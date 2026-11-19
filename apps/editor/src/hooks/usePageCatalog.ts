import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  listLocal,
  loadLocal,
  saveLocal,
  withLivePageLinks,
  type EditorPage,
  type PageNode,
} from "@/store/localStore";
import { listRemote, loadRemote, saveRemote, type RemoteSession } from "@/store/remoteStore";
import { joinCodeFromPath, writeAppLocation } from "@/lib/route";

type HistoryMode = "push" | "replace";

/** 打开邀请链接时不要用当前文档把地址盖掉。 */
function rememberLocation(id: string | null, history: HistoryMode) {
  if (!joinCodeFromPath()) writeAppLocation(id, history);
}

/** 本地和云端的页面列表。邀请链接还在地址栏时，不改写当前路径。 */
export function usePageCatalog({
  pageRef,
  sessionRef,
  setNodes,
  setPage,
}: {
  pageRef: MutableRefObject<EditorPage | null>;
  sessionRef: MutableRefObject<RemoteSession | null>;
  setNodes: Dispatch<SetStateAction<PageNode[]>>;
  setPage: Dispatch<SetStateAction<EditorPage | null>>;
}) {
  const refreshLocal = useCallback((selectId?: string | null, history: HistoryMode = "replace") => {
    const list = listLocal();
    setNodes(list);
    let id = selectId === undefined ? (pageRef.current?.id ?? list[0]?.id) : (selectId ?? list[0]?.id);
    let loaded = id ? loadLocal(id) : undefined;
    if (!loaded && list[0] && id !== list[0].id) {
      id = list[0].id;
      loaded = loadLocal(id);
    }
    if (!loaded) {
      setPage(null);
      rememberLocation(null, history);
      return;
    }
    const healed = withLivePageLinks(loaded, list);
    setPage(healed);
    rememberLocation(healed.id, history);
    if (healed !== loaded) {
      saveLocal(healed);
      setNodes(listLocal());
    }
  }, [pageRef, setNodes, setPage]);

  const refreshRemote = useCallback(async (nextSession: RemoteSession, selectId?: string | null, history: HistoryMode = "replace") => {
    const stale = () => sessionRef.current !== nextSession;
    const list = await listRemote(nextSession);
    if (stale()) return;
    setNodes(list);
    let id = selectId === undefined ? (pageRef.current?.id ?? list[0]?.id) : (selectId ?? list[0]?.id);
    if (!id) {
      setPage(null);
      rememberLocation(null, history);
      return;
    }
    let loaded: EditorPage;
    try {
      loaded = await loadRemote(nextSession, id);
    } catch (err) {
      if (stale() || !list[0] || id === list[0].id) throw err;
      id = list[0].id;
      loaded = await loadRemote(nextSession, id);
    }
    if (stale()) return;
    const healed = withLivePageLinks(loaded, list);
    setPage(healed);
    rememberLocation(healed.id, history);
    if (healed !== loaded) {
      void saveRemote(nextSession, healed).catch(() => undefined);
    }
  }, [pageRef, sessionRef, setNodes, setPage]);

  return { refreshLocal, refreshRemote };
}
