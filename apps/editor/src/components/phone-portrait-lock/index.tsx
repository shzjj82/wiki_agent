import { useEffect } from "react";

/** 手机短边到此为止。iPad 短边从 744 起，不会被锁。 */
const PHONE_SHORT_SIDE = 500;

function isPhone() {
  const short = Math.min(screen.width, screen.height);
  const touch = window.matchMedia("(pointer: coarse) and (hover: none)").matches;
  return touch && short > 0 && short <= PHONE_SHORT_SIDE;
}

function landscape() {
  return window.matchMedia("(orientation: landscape)").matches;
}

/** 工程里的 DOM 类型还没有 lock，运行时再判断。 */
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "portrait") => Promise<void>;
};

function lockableOrientation(): LockableOrientation | null {
  return (screen.orientation as LockableOrientation | undefined) ?? null;
}

/** 系统允许时直接锁竖屏。锁不住（如 iPhone 浏览器）时把页面留在竖屏坐标系，不切成横屏布局。 */
function sync() {
  const root = document.body;
  root.classList.remove("phone-lock-cw", "phone-lock-ccw");
  if (!isPhone() || !landscape()) {
    return;
  }
  const angle = screen.orientation?.angle ?? 0;
  root.classList.add(angle === 270 ? "phone-lock-cw" : "phone-lock-ccw");
}

function lockPortrait() {
  const orientation = lockableOrientation();
  if (!isPhone() || !orientation?.lock) {
    sync();
    return;
  }
  orientation.lock("portrait").then(sync).catch(sync);
}

/** 只限制手机。平板和桌面不锁方向。 */
export function PhonePortraitLock() {
  useEffect(() => {
    lockPortrait();
    const onGesture = () => lockPortrait();
    window.addEventListener("pointerdown", onGesture, { capture: true });
    window.addEventListener("orientationchange", lockPortrait);
    screen.orientation?.addEventListener?.("change", lockPortrait);
    const media = window.matchMedia("(orientation: landscape)");
    media.addEventListener("change", lockPortrait);
    return () => {
      window.removeEventListener("pointerdown", onGesture, { capture: true });
      window.removeEventListener("orientationchange", lockPortrait);
      screen.orientation?.removeEventListener?.("change", lockPortrait);
      media.removeEventListener("change", lockPortrait);
      document.body.classList.remove("phone-lock-cw", "phone-lock-ccw");
      try {
        screen.orientation?.unlock?.();
      } catch {
        /* 没锁上时 unlock 会拒绝 */
      }
    };
  }, []);
  return null;
}
