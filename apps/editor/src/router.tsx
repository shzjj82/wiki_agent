import { createBrowserRouter, Navigate, useLocation } from "react-router";
import { WorkspaceLayout } from "@/layouts/workspace";
import { EditorView } from "@/views/editor";
import { LoginView } from "@/views/login";
import { SharedView } from "@/views/shared";

function ToAppHome() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: "/app", search }} replace />;
}

/**
 * 只登记整屏切换的页面。编辑器里的弹窗、抽屉和团队面板仍是编辑器自己的状态。
 * `/app` 下的页面都套 WorkspaceLayout（侧栏 + 内容区）；以后加的页面（如 `/app/settings`）
 * 写在 `*` 前面即可共用侧栏，静态路径优先于 `*` 匹配。
 */
export const router = createBrowserRouter([
  { path: "/login", element: <LoginView /> },
  { path: "/s/:token", element: <SharedView /> },
  { path: "/s/*", element: <SharedView /> },
  {
    path: "/app",
    element: <WorkspaceLayout />,
    children: [
      { index: true, element: <EditorView /> },
      { path: "*", element: <EditorView /> },
    ],
  },
  { path: "*", element: <ToAppHome /> },
]);
