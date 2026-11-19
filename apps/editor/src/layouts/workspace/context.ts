import { createContext, useContext, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ExportFormat } from "@/lib/document/export";
import type { PageNode } from "@/store/localStore";
import type { NotifyTodo } from "@/store/notifyStore";
import type { RemoteSession } from "@/store/remoteStore";
import type { TeamInfo } from "@/store/teamStore";

/** 侧栏、通知、团队弹窗要对「页面」做的事。由当前子页面注册，没注册时只做跳转。 */
export type PageCommands = {
  openPage: (id: string) => void | Promise<void>;
  createPage: (parentId: string | null, teamId?: string | null) => void | Promise<void>;
  removePage: (id: string) => void;
  movePage: (id: string, parentId: string | null) => void | Promise<void>;
  exportPage: (id: string, format: ExportFormat) => void | Promise<void>;
  writeTodoPage: (todo: NotifyTodo) => Promise<void>;
  openEmptyTeam: (teamId: string) => void;
  /** `selectId` 为 undefined 时保留当前页，null 时回到第一页。 */
  reloadPages: (selectId?: string | null) => Promise<void>;
  /** 退出或解散团队后，子页面清掉跟这个团队有关的界面。 */
  teamRemoved: (teamId: string) => Promise<void>;
};

export type WorkspaceContextValue = {
  isMobile: boolean;
  session: RemoteSession | null;
  sessionRef: MutableRefObject<RemoteSession | null>;
  nodes: PageNode[];
  setNodes: Dispatch<SetStateAction<PageNode[]>>;
  teams: TeamInfo[];
  setTeams: Dispatch<SetStateAction<TeamInfo[]>>;
  teamsReady: boolean;
  activeTeamId: string | null;
  setActiveTeamId: Dispatch<SetStateAction<string | null>>;
  hint: string;
  setHint: Dispatch<SetStateAction<string>>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  /** 侧栏高亮哪一页，由子页面告诉外壳。 */
  setSelectedPageId: (id: string | null) => void;
  openLogin: (replace?: boolean) => void;
  openTeamDetails: (team: TeamInfo) => void;
  reloadTeams: () => void;
  sync: {
    pending: number;
    open: () => void;
  };
  commandsRef: MutableRefObject<PageCommands | null>;
};

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace 只能在 WorkspaceLayout 里用");
  }
  return value;
}

/** 子页面接管侧栏里的页面操作；每次渲染都换成最新的函数，卸载时交还给外壳。 */
export function usePageCommands(commands: PageCommands) {
  const { commandsRef } = useWorkspace();
  commandsRef.current = commands;
  useEffect(() => {
    commandsRef.current = commands;
  });
  useEffect(() => {
    return () => {
      commandsRef.current = null;
    };
  }, [commandsRef]);
}
