import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Camera } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isImageFile } from "@/lib/document/fileKinds";
import { useVisualViewport } from "@/lib/useKeyboardInset";
import { cn } from "@/lib/utils";

export const CAMERA_FAB_SIZE = 56;
const FAB_KEY = "editor:camera-fab";
const TAP_PX = 8;
const EDGE = 12;

export type CameraFabPos = { x: number; y: number };

type Box = { width: number; height: number };

function viewportBox(): Box {
  const vp = window.visualViewport;
  return { width: Math.round(vp?.width ?? window.innerWidth), height: Math.round(vp?.height ?? window.innerHeight) };
}

export function clampCameraFab(pos: CameraFabPos, box: Box, bottomInset = EDGE): CameraFabPos {
  const maxX = Math.max(EDGE, box.width - CAMERA_FAB_SIZE - EDGE);
  const maxY = Math.max(EDGE, box.height - CAMERA_FAB_SIZE - bottomInset);
  return {
    x: Math.min(Math.max(EDGE, pos.x), maxX),
    y: Math.min(Math.max(EDGE, pos.y), maxY),
  };
}

export function defaultCameraFab(box: Box, bottomInset = EDGE): CameraFabPos {
  return clampCameraFab({ x: box.width, y: box.height }, box, bottomInset);
}

function loadPos(box: Box, bottomInset: number): CameraFabPos {
  try {
    const raw = localStorage.getItem(FAB_KEY);
    if (!raw) {
      return defaultCameraFab(box, bottomInset);
    }
    const parsed = JSON.parse(raw) as Partial<CameraFabPos>;
    return clampCameraFab({ x: Number(parsed.x) || 0, y: Number(parsed.y) || 0 }, box, bottomInset);
  } catch {
    return defaultCameraFab(box, bottomInset);
  }
}

function savePos(pos: CameraFabPos) {
  localStorage.setItem(FAB_KEY, JSON.stringify(pos));
}

type Props = {
  /** 底栏占用的高度，拖到下沿时避开 */
  bottomInset?: number;
  onPick: (file: File) => void;
};

export function CameraFab({ bottomInset = EDGE, onPick }: Props) {
  const { t } = useTranslation();
  const viewport = useVisualViewport();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const [pos, setPos] = useState(() => loadPos(viewportBox(), bottomInset));

  useEffect(() => {
    setPos((current) => clampCameraFab(current, viewportBox(), bottomInset));
  }, [bottomInset, viewport.height, viewport.top]);

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, left: pos.x, top: pos.y, moved: false };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && dx * dx + dy * dy < TAP_PX * TAP_PX) {
      return;
    }
    drag.moved = true;
    const next = clampCameraFab({ x: drag.left + dx, y: drag.top + dy }, viewportBox(), bottomInset);
    setPos(next);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag) {
      return;
    }
    if (drag.moved) {
      const next = clampCameraFab(
        { x: drag.left + (event.clientX - drag.x), y: drag.top + (event.clientY - drag.y) },
        viewportBox(),
        bottomInset,
      );
      setPos(next);
      savePos(next);
      return;
    }
    inputRef.current?.click();
  }

  const offsetLeft = window.visualViewport?.offsetLeft ?? 0;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file && (file.type.startsWith("image/") || isImageFile(file))) {
            onPick(file);
          }
        }}
      />
      <button
        type="button"
        aria-label={t("imagePaste.camera")}
        className={cn(
          "fixed z-30 flex items-center justify-center rounded-full border border-border/70 bg-background/80 text-foreground shadow-md backdrop-blur-md",
          "touch-none select-none",
        )}
        style={{
          width: CAMERA_FAB_SIZE,
          height: CAMERA_FAB_SIZE,
          left: offsetLeft + pos.x,
          top: viewport.top + pos.y,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <Camera size={22} />
      </button>
    </>
  );
}
