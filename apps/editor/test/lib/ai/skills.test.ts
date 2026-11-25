import { describe, expect, it } from "vitest";
import { desktopExternalUrl } from "@/lib/ai/skills";

const page = "http://127.0.0.1:47321/app";

describe("desktop external chat links", () => {
  it("hands an outside website to the system browser", () => {
    expect(desktopExternalUrl("https://example.com/docs?q=1", page)).toBe("https://example.com/docs?q=1");
  });

  it("keeps links that stay inside the app", () => {
    expect(desktopExternalUrl("http://127.0.0.1:47321/app/page-1", page)).toBeNull();
    expect(desktopExternalUrl("/app/page-1", page)).toBeNull();
  });

  it("rejects scripts and other schemes", () => {
    expect(desktopExternalUrl("javascript:alert(1)", page)).toBeNull();
    expect(desktopExternalUrl("file:///etc/passwd", page)).toBeNull();
    expect(desktopExternalUrl("https://user:pass@example.com", page)).toBeNull();
  });
});
