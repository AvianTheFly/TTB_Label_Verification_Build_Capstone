export interface ImageLayout {
  height: number;
  left: number;
  top: number;
  viewportLeft: number;
  viewportTop: number;
  width: number;
}

export const ZOOM_ENTER_BUFFER_PX = 10;
export const ZOOM_LEAVE_BUFFER_PX = 18;
export const ZOOM_SCALE = 4.3;
export const IMAGE_DRAG_THRESHOLD_PX = 4;

export function lensSizeForZoomPane(
  imageRect: ImageLayout | null,
  zoomRect: DOMRect | undefined
): { height: number; width: number } {
  if (!imageRect || !zoomRect || imageRect.width <= 0 || imageRect.height <= 0) {
    return { height: 52, width: 104 };
  }

  return {
    height: Math.max(42, Math.min(imageRect.height, zoomRect.height / ZOOM_SCALE)),
    width: Math.max(72, Math.min(imageRect.width, zoomRect.width / ZOOM_SCALE))
  };
}

export function imagePointFromClientPoint(
  clientX: number,
  clientY: number,
  imageLayout: ImageLayout | null,
  pan: { x: number; y: number },
  rotation: number
): { x: number; y: number } {
  if (!imageLayout || imageLayout.width <= 0 || imageLayout.height <= 0) {
    return { x: 0, y: 0 };
  }

  const centerX = imageLayout.viewportLeft + imageLayout.left + imageLayout.width / 2 + pan.x;
  const centerY = imageLayout.viewportTop + imageLayout.top + imageLayout.height / 2 + pan.y;
  const radians = (-rotation * Math.PI) / 180;
  const deltaX = clientX - centerX;
  const deltaY = clientY - centerY;
  const localX = deltaX * Math.cos(radians) - deltaY * Math.sin(radians) + imageLayout.width / 2;
  const localY =
    deltaX * Math.sin(radians) + deltaY * Math.cos(radians) + imageLayout.height / 2;

  return {
    x: Math.min(imageLayout.width, Math.max(0, localX)),
    y: Math.min(imageLayout.height, Math.max(0, localY))
  };
}

export function constrainImagePan(
  pan: { x: number; y: number },
  rotation: number,
  imageLayout: ImageLayout,
  frameRect: DOMRect
): { x: number; y: number } {
  const bounds = rotatedBounds(imageLayout.width, imageLayout.height, rotation);
  return {
    x: constrainAxis(
      pan.x,
      imageLayout.left + bounds.left,
      imageLayout.left + bounds.right,
      frameRect.width
    ),
    y: constrainAxis(
      pan.y,
      imageLayout.top + bounds.top,
      imageLayout.top + bounds.bottom,
      frameRect.height
    )
  };
}

export function containedImageLayout(
  frameRect: DOMRect,
  naturalSize: { height: number; width: number }
): ImageLayout {
  const frameRatio = frameRect.width / frameRect.height;
  const imageRatio = naturalSize.width / naturalSize.height;
  const width = imageRatio > frameRatio ? frameRect.width : frameRect.height * imageRatio;
  const height = imageRatio > frameRatio ? frameRect.width / imageRatio : frameRect.height;

  return {
    height,
    left: (frameRect.width - width) / 2,
    top: (frameRect.height - height) / 2,
    viewportLeft: frameRect.left,
    viewportTop: frameRect.top,
    width
  };
}

export function normalizeRotation(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function constrainAxis(value: number, lowEdge: number, highEdge: number, frameSize: number): number {
  const rotatedSize = highEdge - lowEdge;
  if (rotatedSize <= frameSize) {
    return frameSize / 2 - (lowEdge + highEdge) / 2;
  }

  const min = frameSize - highEdge;
  const max = -lowEdge;
  return Math.min(max, Math.max(min, value));
}

function rotatedBounds(width: number, height: number, rotation: number) {
  const radians = (rotation * Math.PI) / 180;
  const centerX = width / 2;
  const centerY = height / 2;
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height }
  ].map((corner) => {
    const deltaX = corner.x - centerX;
    const deltaY = corner.y - centerY;
    return {
      x: deltaX * Math.cos(radians) - deltaY * Math.sin(radians) + centerX,
      y: deltaX * Math.sin(radians) + deltaY * Math.cos(radians) + centerY
    };
  });

  return {
    bottom: Math.max(...corners.map((corner) => corner.y)),
    left: Math.min(...corners.map((corner) => corner.x)),
    right: Math.max(...corners.map((corner) => corner.x)),
    top: Math.min(...corners.map((corner) => corner.y))
  };
}
