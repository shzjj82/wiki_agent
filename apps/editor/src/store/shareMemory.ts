import { sharePageUrl } from "@/store/shareStore";

export type RememberedShare = {
  token: string;
  pageId: string;
  title: string;
  expiresAt: string | null;
  createdAt: string;
};

const KEY = "editor:remembered-shares";

function readAll(): RememberedShare[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") {
          return null;
        }
        const item = row as Record<string, unknown>;
        const token = typeof item.token === "string" ? item.token.trim() : "";
        const pageId = typeof item.pageId === "string" ? item.pageId.trim() : "";
        const title = typeof item.title === "string" ? item.title.trim() : "";
        if (!token || !pageId) {
          return null;
        }
        return {
          token,
          pageId,
          title: title || pageId,
          expiresAt: typeof item.expiresAt === "string" ? item.expiresAt : null,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
        } satisfies RememberedShare;
      })
      .filter((item): item is RememberedShare => Boolean(item));
  } catch {
    return [];
  }
}

function writeAll(list: RememberedShare[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 40)));
}

export function listRememberedShares(): RememberedShare[] {
  const now = Date.now();
  const alive = readAll().filter((item) => {
    if (!item.expiresAt) {
      return true;
    }
    const end = new Date(item.expiresAt).getTime();
    return Number.isNaN(end) || end >= now;
  });
  if (alive.length !== readAll().length) {
    writeAll(alive);
  }
  return alive;
}

export function rememberShare(input: Omit<RememberedShare, "createdAt"> & { createdAt?: string }) {
  const next: RememberedShare = {
    token: input.token,
    pageId: input.pageId,
    title: input.title,
    expiresAt: input.expiresAt,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  const rest = listRememberedShares().filter((item) => item.token !== next.token);
  writeAll([next, ...rest]);
}

export function sharePreviewUrl(token: string): string {
  return sharePageUrl(token);
}
