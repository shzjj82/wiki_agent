import { beforeEach, describe, expect, it } from "vitest";
import { applyPersistedSession, clearSession, loadSession } from "./remoteStore";

describe("applyPersistedSession", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("puts a saved login back when the page storage is empty", () => {
    const restored = applyPersistedSession(
      JSON.stringify({ token: "access", username: "ada", refreshToken: "refresh" }),
    );

    expect(restored).toBe(true);
    expect(loadSession()).toMatchObject({ token: "access", username: "ada", refreshToken: "refresh" });
  });

  it("keeps the login already in the page", () => {
    applyPersistedSession(JSON.stringify({ token: "first", username: "ada" }));

    expect(applyPersistedSession(JSON.stringify({ token: "second", username: "ada" }))).toBe(false);
    expect(loadSession()?.token).toBe("first");
  });

  it("drops the saved login on logout", () => {
    applyPersistedSession(JSON.stringify({ token: "access", username: "ada" }));
    clearSession();

    expect(loadSession()).toBeNull();
  });
});
