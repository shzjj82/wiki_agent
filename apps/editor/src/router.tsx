import { createBrowserRouter, redirect } from "react-router";
import { bindAppNavigator } from "@/lib/route";

const loginView = () => import("@/views/login").then((m) => ({ Component: m.LoginView }));
const sharedView = () => import("@/views/shared").then((m) => ({ Component: m.SharedView }));
const editorView = () => import("@/views/editor").then((m) => ({ Component: m.EditorView }));

/**
 * 只登记整屏切换的页面。编辑器里的弹窗、抽屉和团队面板仍是编辑器自己的状态。
 * 页面都按需加载：登录页、分享页不会下载编辑器。
 * `/app` 下的页面都套 WorkspaceLayout（侧栏 + 内容区）；以后加的页面（如 `/app/settings`）
 * 写在编辑器路由前面即可共用侧栏，静态路径优先于动态参数匹配。
 * `/app`、`/app/:pageId`、`/app/join/:code` 必须是同一条路由，切文档时编辑器才不会重新挂载。
 */
export const router = createBrowserRouter([
  { path: "/login", lazy: loginView },
  { path: "/s/:token", lazy: sharedView },
  { path: "/s/*", lazy: sharedView },
  {
    path: "/app",
    lazy: () => import("@/layouts/workspace").then((m) => ({ Component: m.WorkspaceLayout })),
    children: [{ path: ":pageId?/:code?", lazy: editorView }],
  },
  {
    path: "*",
    loader({ request }) {
      const url = new URL(request.url);
      return redirect(`/app${url.search}`);
    },
  },
]);

bindAppNavigator((to, replace) => void router.navigate(to, { replace }));
