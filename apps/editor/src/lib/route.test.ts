import { describe, expect, it } from "vitest";
import { appPagePath, correctedAppPath, joinCodeFromPath, loginPath, readAppLocation, safeRedirect } from "./route";

describe("safeRedirect", () => {
  it("keeps in-site paths", () => {
    expect(safeRedirect("/app/abc?x=1")).toBe("/app/abc?x=1");
    expect(safeRedirect("/app/join/AB12CD")).toBe("/app/join/AB12CD");
  });

  it("falls back to /app for empty, external or login targets", () => {
    expect(safeRedirect(null)).toBe("/app");
    expect(safeRedirect("")).toBe("/app");
    expect(safeRedirect("https://evil.com")).toBe("/app");
    expect(safeRedirect("//evil.com")).toBe("/app");
    expect(safeRedirect("/login?redirect=/app")).toBe("/app");
  });
});

describe("loginPath", () => {
  it("encodes the redirect target", () => {
    expect(loginPath("/app/a b")).toBe("/login?redirect=%2Fapp%2Fa%20b");
  });

  it("never redirects back to the login page", () => {
    expect(loginPath("/login")).toBe("/login?redirect=%2Fapp");
  });
});

describe("readAppLocation", () => {
  it("reads the page id from /app/:pageId", () => {
    expect(readAppLocation("http://localhost/app/page-1")).toEqual({ pageId: "page-1" });
    expect(readAppLocation("http://localhost/app/page%201/")).toEqual({ pageId: "page 1" });
  });

  it("ignores /app and invite links", () => {
    expect(readAppLocation("http://localhost/app")).toEqual({ pageId: null });
    expect(readAppLocation("http://localhost/app/join/AB12CD")).toEqual({ pageId: null });
    expect(readAppLocation("http://localhost/s/token")).toEqual({ pageId: null });
  });
});

describe("joinCodeFromPath", () => {
  it("reads the team code from /app/join/:code", () => {
    expect(joinCodeFromPath("/app/join/AB12CD")).toBe("AB12CD");
    expect(joinCodeFromPath("/app/join/AB12CD/")).toBe("AB12CD");
  });

  it("returns null elsewhere", () => {
    expect(joinCodeFromPath("/app/abc")).toBeNull();
    expect(joinCodeFromPath("/app/join")).toBeNull();
  });
});

describe("appPagePath", () => {
  it("builds the page url", () => {
    expect(appPagePath("a b")).toBe("/app/a%20b");
    expect(appPagePath(null)).toBe("/app");
    expect(appPagePath("  ")).toBe("/app");
  });
});

describe("correctedAppPath", () => {
  const known = new Set(["real"]);

  it("replaces a missing page with the page that actually opened", () => {
    expect(correctedAppPath("/app/missing", "real", known)).toBe("/app/real");
    expect(correctedAppPath("/app/missing/", null, new Set())).toBe("/app");
  });

  it("leaves a real page, the home address, and invite links alone", () => {
    expect(correctedAppPath("/app/real", "other", known)).toBeNull();
    expect(correctedAppPath("/app", null, new Set())).toBeNull();
    expect(correctedAppPath("/app/join/AB12CD", "real", known)).toBeNull();
    expect(correctedAppPath("/login", "real", known)).toBeNull();
  });
});
