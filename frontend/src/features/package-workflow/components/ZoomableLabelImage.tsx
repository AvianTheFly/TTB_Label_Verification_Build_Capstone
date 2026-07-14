import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

import {
  IMAGE_DRAG_THRESHOLD_PX,
  ZOOM_ENTER_BUFFER_PX,
  ZOOM_LEAVE_BUFFER_PX,
  ZOOM_SCALE,
  containedImageLayout,
  constrainImagePan,
  imagePointFromClientPoint,
  lensSizeForZoomPane,
  normalizeRotation
} from "./zoomGeometry";

interface ZoomableLabelImageProps {
  alt: string;
  src: string;
}

export function ZoomableLabelImage({ alt, src }: ZoomableLabelImageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const zoomPaneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    didDrag: boolean;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const frozenRef = useRef(false);
  const leftFrozenImageRef = useRef(false);
  const panRef = useRef({ x: 0, y: 0 });
  const [zoomPosition, setZoomPosition] = useState({
    active: false,
    frozen: false,
    lensHeight: 96,
    lensLeft: 50,
    lensTop: 50,
    lensWidth: 96,
    zoomImageHeight: 0,
    zoomImageLeft: 0,
    zoomImageTop: 0,
    zoomImageWidth: 0,
    zoomOriginX: 0,
    zoomOriginY: 0,
    x: 50,
    y: 50
  });
  const [imageNaturalSize, setImageNaturalSize] = useState({ height: 1, width: 1 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    function handleWindowPointerMove(event: globalThis.PointerEvent) {
      const frame = frameRef.current;
      if (!frame || !frozenRef.current) {
        return;
      }

      const rect = frame.getBoundingClientRect();
      const isBeyondLeaveBuffer =
        event.clientX < rect.left - ZOOM_LEAVE_BUFFER_PX ||
        event.clientX > rect.right + ZOOM_LEAVE_BUFFER_PX ||
        event.clientY < rect.top - ZOOM_LEAVE_BUFFER_PX ||
        event.clientY > rect.bottom + ZOOM_LEAVE_BUFFER_PX;

      if (isBeyondLeaveBuffer) {
        leftFrozenImageRef.current = true;
        return;
      }

      const isInsideEnterBuffer =
        event.clientX > rect.left + ZOOM_ENTER_BUFFER_PX &&
        event.clientX < rect.right - ZOOM_ENTER_BUFFER_PX &&
        event.clientY > rect.top + ZOOM_ENTER_BUFFER_PX &&
        event.clientY < rect.bottom - ZOOM_ENTER_BUFFER_PX;

      if (leftFrozenImageRef.current && isInsideEnterBuffer) {
        frozenRef.current = false;
        leftFrozenImageRef.current = false;
        setZoomPosition((current) => ({ ...current, frozen: false }));
        updateZoomPositionFromCoordinates(event.clientX, event.clientY, { force: true });
      }
    }

    window.addEventListener("pointermove", handleWindowPointerMove);
    return () => window.removeEventListener("pointermove", handleWindowPointerMove);
  }, []);

  function updateZoomPosition(
    event: PointerEvent<HTMLDivElement>,
    options: { force?: boolean } = {}
  ) {
    if (frozenRef.current && !options.force) {
      return;
    }

    updateZoomPositionFromCoordinates(event.clientX, event.clientY, options);
  }

  function startImagePointer(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      didDrag: false,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: panRef.current.x,
      startPanY: panRef.current.y
    };
  }

  function moveImagePointer(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      updateZoomPosition(event);
      return;
    }

    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    if (Math.hypot(deltaX, deltaY) < IMAGE_DRAG_THRESHOLD_PX && !drag.didDrag) {
      updateZoomPosition(event);
      return;
    }

    drag.didDrag = true;
    const frameRect = frameRef.current?.getBoundingClientRect();
    if (!frameRect) {
      return;
    }
    const imageLayout = containedImageLayout(frameRect, imageNaturalSize);

    const nextPan = constrainImagePan(
      {
        x: drag.startPanX + deltaX,
        y: drag.startPanY + deltaY
      },
      rotation,
      imageLayout,
      frameRect
    );
    panRef.current = nextPan;
    setPan(nextPan);
    if (!frozenRef.current) {
      updateZoomPositionFromCoordinates(event.clientX, event.clientY);
    }
  }

  function endImagePointer(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    if (!drag.didDrag) {
      toggleFrozenZoom(event);
    }
  }

  function updateZoomPositionFromCoordinates(
    clientX: number,
    clientY: number,
    options: { force?: boolean } = {}
  ) {
    if (frozenRef.current && !options.force) {
      return;
    }

    const frameRect = frameRef.current?.getBoundingClientRect();
    const zoomRect = zoomPaneRef.current?.getBoundingClientRect();
    const imageLayout = frameRect ? containedImageLayout(frameRect, imageNaturalSize) : null;
    const imagePoint = imagePointFromClientPoint(
      clientX,
      clientY,
      imageLayout,
      panRef.current,
      rotation
    );
    const x = imageLayout && imageLayout.width > 0 ? (imagePoint.x / imageLayout.width) * 100 : 50;
    const y =
      imageLayout && imageLayout.height > 0 ? (imagePoint.y / imageLayout.height) * 100 : 50;
    const clampedX = Math.min(100, Math.max(0, x));
    const clampedY = Math.min(100, Math.max(0, y));
    const lensSize = lensSizeForZoomPane(imageLayout, zoomRect);
    const lensLeft = frameRect ? clientX - frameRect.left : 50;
    const lensTop = frameRect ? clientY - frameRect.top : 50;
    const zoomOriginX = imageLayout ? (clampedX / 100) * imageLayout.width : 0;
    const zoomOriginY = imageLayout ? (clampedY / 100) * imageLayout.height : 0;
    const zoomImageWidth = imageLayout?.width ?? 0;
    const zoomImageHeight = imageLayout?.height ?? 0;

    setZoomPosition({
      active: true,
      frozen: frozenRef.current,
      lensHeight: lensSize.height,
      lensLeft,
      lensTop,
      lensWidth: lensSize.width,
      zoomImageHeight,
      zoomImageLeft: zoomRect ? zoomRect.width / 2 - zoomOriginX : 0,
      zoomImageTop: zoomRect ? zoomRect.height / 2 - zoomOriginY : 0,
      zoomImageWidth,
      zoomOriginX,
      zoomOriginY,
      x: clampedX,
      y: clampedY
    });
  }

  function toggleFrozenZoom(event: PointerEvent<HTMLDivElement>) {
    if (frozenRef.current) {
      frozenRef.current = false;
      leftFrozenImageRef.current = false;
      setZoomPosition((current) => ({ ...current, frozen: false }));
      updateZoomPosition(event, { force: true });
      return;
    }

    updateZoomPosition(event, { force: true });
    frozenRef.current = true;
    leftFrozenImageRef.current = false;
    setZoomPosition((current) => ({ ...current, active: true, frozen: true }));
  }

  function centerZoom() {
    setZoomPosition((current) => ({ ...current, active: true }));
  }

  function restZoom() {
    if (frozenRef.current) {
      return;
    }

    leftFrozenImageRef.current = false;
    setZoomPosition((current) => ({ ...current, active: false, frozen: false }));
  }

  function rotateImage(degrees: number) {
    setRotation((current) => {
      const nextRotation = normalizeRotation(current + degrees);
      const frameRect = frameRef.current?.getBoundingClientRect();
      if (frameRect) {
        const imageLayout = containedImageLayout(frameRect, imageNaturalSize);
        const nextPan = constrainImagePan(panRef.current, nextRotation, imageLayout, frameRect);
        panRef.current = nextPan;
        setPan(nextPan);
      }
      return nextRotation;
    });
  }

  const frameRect = frameRef.current?.getBoundingClientRect();
  const imageLayout = frameRect ? containedImageLayout(frameRect, imageNaturalSize) : null;
  const imageStyle = {
    height: imageLayout ? `${imageLayout.height}px` : "100%",
    left: imageLayout ? `${imageLayout.left}px` : "0",
    top: imageLayout ? `${imageLayout.top}px` : "0",
    transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg)`,
    width: imageLayout ? `${imageLayout.width}px` : "100%"
  };
  const zoomImageStyle = {
    height: `${zoomPosition.zoomImageHeight}px`,
    left: `${zoomPosition.zoomImageLeft}px`,
    top: `${zoomPosition.zoomImageTop}px`,
    transform: `rotate(${rotation}deg) scale(${ZOOM_SCALE})`,
    transformOrigin: `${zoomPosition.zoomOriginX}px ${zoomPosition.zoomOriginY}px`,
    width: `${zoomPosition.zoomImageWidth}px`
  };

  return (
    <div className="detail-image-zoom">
      <div
        aria-label="Label image"
        className={`detail-image-frame ${zoomPosition.active ? "detail-image-frame--active" : ""} ${
          zoomPosition.frozen ? "detail-image-frame--frozen" : ""
        }`}
        onBlur={restZoom}
        onFocus={centerZoom}
        onPointerDown={startImagePointer}
        onPointerEnter={updateZoomPosition}
        onPointerLeave={restZoom}
        onPointerMove={moveImagePointer}
        onPointerCancel={endImagePointer}
        onPointerUp={endImagePointer}
        onPointerOut={restZoom}
        onPointerOver={updateZoomPosition}
        ref={frameRef}
        role="img"
        tabIndex={0}
      >
        <div className="detail-image-frame__clip">
          <img
            alt={alt}
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            onLoad={(event) =>
              setImageNaturalSize({
                height: event.currentTarget.naturalHeight || 1,
                width: event.currentTarget.naturalWidth || 1
              })
            }
            ref={imageRef}
            src={src}
            style={imageStyle}
          />
        </div>
        <span
          aria-hidden="true"
          className={`detail-image-frame__lens ${
            zoomPosition.frozen ? "detail-image-frame__lens--locked" : ""
          }`}
          style={{
            height: `${zoomPosition.lensHeight}px`,
            left: `${zoomPosition.lensLeft}px`,
            top: `${zoomPosition.lensTop}px`,
            width: `${zoomPosition.lensWidth}px`
          }}
        />
        {!zoomPosition.frozen && (
          <span
            aria-hidden="true"
            className="detail-image-frame__hint"
            style={{
              left: `${zoomPosition.lensLeft + zoomPosition.lensWidth / 2 + 10}px`,
              top: `${zoomPosition.lensTop - zoomPosition.lensHeight / 2}px`
            }}
          >
            Click to Lock
            <br />
            Drag to move image
          </span>
        )}
      </div>
      <div className="detail-image-controls" aria-label="Rotate label image">
        <button
          aria-label="Rotate image left"
          className="image-rotate-button"
          onClick={() => rotateImage(-5)}
          title="Rotate left"
          type="button"
        >
          <RotateLeftIcon />
        </button>
        <span className="detail-image-controls__hint">click buttons to rotate image</span>
        <button
          aria-label="Rotate image right"
          className="image-rotate-button"
          onClick={() => rotateImage(5)}
          title="Rotate right"
          type="button"
        >
          <RotateRightIcon />
        </button>
      </div>
      <div
        aria-label="Magnified label image"
        className={`detail-zoom-pane ${zoomPosition.active ? "detail-zoom-pane--active" : ""}`}
        ref={zoomPaneRef}
        role="img"
      >
        {!zoomPosition.active && (
          <p className="detail-zoom-pane__empty">Hover Mouse Over Image To Zoom In</p>
        )}
        <div
          className={`detail-zoom-pane__clip ${
            zoomPosition.active ? "detail-zoom-pane__clip--active" : ""
          }`}
        >
          <img
            alt=""
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            src={src}
            style={zoomImageStyle}
          />
        </div>
      </div>
    </div>
  );
}

function RotateLeftIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8.1 8.1A6.5 6.5 0 0 1 19 12.8l-2-.1A4.5 4.5 0 0 0 9.5 9.5L12 12H5V5l3.1 3.1Z" />
    </svg>
  );
}

function RotateRightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M15.9 8.1A6.5 6.5 0 0 0 5 12.8l2-.1a4.5 4.5 0 0 1 7.5-3.2L12 12h7V5l-3.1 3.1Z" />
    </svg>
  );
}
