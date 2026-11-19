import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { HISTORY_SIDEBAR_W } from "./HistoryPanel";

export type Frame = { x: number; y: number; w: number; h: number };
export type ResizeCorner = "nw" | "ne" | "sw" | "se";
type DragMode = "move" | ResizeCorner;

const FRAME_KEY = "editor:wiki-chat-frame";
const MIN_W = 340;
const MIN_H = 480;
const DEFAULT_H = 720;
const LEGACY_H = 560;

function defaultFrame(): Frame {
  const w = Math.min(400, Math.max(MIN_W, window.innerWidth - 32));
  const h = Math.min(DEFAULT_H, Math.max(MIN_H, window.innerHeight - 40));
  return {
    w,
    h,
    x: Math.max(16, window.innerWidth - w - 24),
    y: Math.max(16, window.innerHeight - h - 24),
  };
}

function loadFrame(): Frame {
  try {
    const raw = localStorage.getItem(FRAME_KEY);
    if (!raw) {
      return defaultFrame();
    }
    const parsed = JSON.parse(raw) as Partial<Frame>;
    const base = defaultFrame();
    const savedH = Number(parsed.h) || 0;
    const useDefaultH = !savedH || savedH === LEGACY_H;
    return clampFrame({
      x: Number(parsed.x) || base.x,
      y: useDefaultH ? base.y : Number(parsed.y) || base.y,
      w: Number(parsed.w) || base.w,
      h: useDefaultH ? base.h : savedH,
    });
  } catch {
    return defaultFrame();
  }
}

export function windowBox(frame: Frame, historyOpen: boolean): { left: number; width: number } {
  if (!historyOpen) {
    return { left: frame.x, width: frame.w };
  }
  const extra = HISTORY_SIDEBAR_W;
  const preferLeft = frame.x - extra;
  if (preferLeft >= 8) {
    return { left: preferLeft, width: frame.w + extra };
  }
  const maxRight = window.innerWidth - 8;
  return { left: frame.x, width: Math.min(frame.w + extra, Math.max(frame.w, maxRight - frame.x)) };
}

function clampFrame(frame: Frame): Frame {
  const w = Math.min(Math.max(frame.w, MIN_W), Math.max(MIN_W, window.innerWidth - 16));
  const h = Math.min(Math.max(frame.h, MIN_H), Math.max(MIN_H, window.innerHeight - 16));
  return {
    w,
    h,
    x: Math.min(Math.max(8, frame.x), Math.max(8, window.innerWidth - w - 8)),
    y: Math.min(Math.max(8, frame.y), Math.max(8, window.innerHeight - h - 8)),
  };
}

function resizeFrame(start: Frame, dx: number, dy: number, corner: ResizeCorner): Frame {
  const maxW = Math.max(MIN_W, window.innerWidth - 16);
  const maxH = Math.max(MIN_H, window.innerHeight - 16);
  const east = corner === "ne" || corner === "se";
  const south = corner === "sw" || corner === "se";
  const w = Math.min(Math.max(east ? start.w + dx : start.w - dx, MIN_W), maxW);
  const h = Math.min(Math.max(south ? start.h + dy : start.h - dy, MIN_H), maxH);
  return clampFrame({
    w,
    h,
    x: east ? start.x : start.x + start.w - w,
    y: south ? start.y : start.y + start.h - h,
  });
}

export function useFloatingFrame(open: boolean, focusToken: number) {
  const [frame, setFrame] = useState<Frame>(() => (typeof window === "undefined" ? { x: 24, y: 24, w: 400, h: DEFAULT_H } : loadFrame()));
  const dragRef = useRef<{ pointer: number; x: number; y: number; start: Frame; mode: DragMode } | null>(null);

  useEffect(() => {
    if (open) {
      setFrame(loadFrame());
    }
  }, [open, focusToken]);

  useEffect(() => {
    const onResize = () => setFrame((prev) => clampFrame(prev));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    localStorage.setItem(FRAME_KEY, JSON.stringify(frame));
  }, [frame, open]);

  const beginDrag = (event: ReactPointerEvent, mode: DragMode) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, start: frame, mode };
  };

  const onDragMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointer !== event.pointerId) {
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (drag.mode === "move") {
      setFrame(clampFrame({ ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy }));
      return;
    }
    setFrame(resizeFrame(drag.start, dx, dy, drag.mode));
  };

  const endDrag = (event: ReactPointerEvent) => {
    if (dragRef.current?.pointer === event.pointerId) {
      dragRef.current = null;
    }
  };

  return { frame, beginDrag, onDragMove, endDrag };
}
