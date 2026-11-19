import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@/i18n";
import { App } from "./App";
import { MarkdownImportPage } from "@/components/markdown-import";
import { SharedPage } from "@/components/shared-page";
import { PhonePortraitLock } from "@/components/phone-portrait-lock";
import { registerPwa } from "@/components/pwa-install";
import { isMarkdownRoute } from "@/lib/route";
import { isShareRoute, shareTokenFromPath } from "@/lib/shareRoute";
import "./styles/index.css";

registerPwa();

function Root() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  let page = <App />;
  if (isShareRoute(path)) {
    page = <SharedPage token={shareTokenFromPath(path) ?? ""} />;
  } else if (isMarkdownRoute(path)) {
    page = <MarkdownImportPage />;
  }
  return (
    <>
      {page}
      <PhonePortraitLock />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
