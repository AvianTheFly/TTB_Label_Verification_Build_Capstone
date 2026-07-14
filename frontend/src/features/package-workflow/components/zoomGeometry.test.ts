import { describe, expect, it } from "vitest";

import {
  containedImageLayout,
  imagePointFromClientPoint,
  normalizeRotation
} from "./zoomGeometry";

function domRect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    bottom: overrides.bottom ?? 400,
    height: overrides.height ?? 400,
    left: overrides.left ?? 10,
    right: overrides.right ?? 810,
    top: overrides.top ?? 20,
    width: overrides.width ?? 800,
    x: overrides.x ?? 10,
    y: overrides.y ?? 20,
    toJSON: () => ({})
  };
}

describe("zoom geometry helpers", () => {
  it("fits a wide label inside the image frame", () => {
    const layout = containedImageLayout(domRect(), { height: 400, width: 1200 });

    expect(layout.width).toBe(800);
    expect(layout.height).toBeCloseTo(266.67, 2);
    expect(layout.left).toBe(0);
    expect(layout.top).toBeCloseTo(66.67, 2);
  });

  it("maps pointer coordinates into image-local coordinates", () => {
    const layout = containedImageLayout(domRect(), { height: 400, width: 800 });

    expect(
      imagePointFromClientPoint(410, 220, layout, { x: 0, y: 0 }, 0)
    ).toEqual({ x: 400, y: 200 });
  });

  it("normalizes rotation into the shortest signed angle", () => {
    expect(normalizeRotation(365)).toBe(5);
    expect(normalizeRotation(270)).toBe(-90);
  });
});
