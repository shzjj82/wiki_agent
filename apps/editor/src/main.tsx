import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import "@/i18n";
import { registerPwa } from "@/components/pwa-install";
import { ensureLatestWebVersion } from "@/lib/webVersion";
import { router } from "./router";
import "./styles/index.css";

void ensureLatestWebVersion().then((reloading) => {
  if (reloading) {
    return;
  }
  registerPwa();
  createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
});
