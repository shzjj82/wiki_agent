import { describe, expect, it } from "vitest";
import { CAMERA_FAB_SIZE, clampCameraFab, defaultCameraFab } from "@/components/block-editor/CameraFab";

const box = { width: 390, height: 844 };

describe("camera fab position", () => {
  it("clamps inside the viewport", () => {
    expect(clampCameraFab({ x: -20, y: 900 }, box, 12)).toEqual({ x: 12, y: 844 - CAMERA_FAB_SIZE - 12 });
  });

  it("defaults to the bottom-right corner", () => {
    expect(defaultCameraFab(box, 12)).toEqual({
      x: 390 - CAMERA_FAB_SIZE - 12,
      y: 844 - CAMERA_FAB_SIZE - 12,
    });
  });
});
