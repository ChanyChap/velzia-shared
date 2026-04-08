"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

export interface DragLoupeHandle {
  update(pointX: number, pointY: number): void;
}

interface DragLoupeProps {
  /** Ref to the already-loaded <img> element — avoids re-downloading the photo */
  imgRef: React.RefObject<HTMLImageElement | null>;
  /** Image bounds within the container (from object-contain calculation) */
  imageBounds: { offsetX: number; offsetY: number; width: number; height: number };
  /** Container dimensions */
  containerWidth: number;
  containerHeight: number;
}

const LOUPE_SIZE = 120;
const ZOOM = 3;
const MARGIN = 12;

export const DragLoupe = forwardRef<DragLoupeHandle, DragLoupeProps>(
  function DragLoupe({ imgRef, imageBounds, containerWidth, containerHeight }, ref) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useImperativeHandle(ref, () => ({
      update(pointX: number, pointY: number) {
        const wrapper = wrapperRef.current;
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!wrapper || !canvas || !img || !img.naturalWidth) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Source rect in natural-image pixels, centered on the dragged point
        const srcW = img.naturalWidth / ZOOM;
        const srcH = img.naturalHeight / ZOOM;
        const srcX = Math.max(0, Math.min(pointX * img.naturalWidth - srcW / 2, img.naturalWidth - srcW));
        const srcY = Math.max(0, Math.min(pointY * img.naturalHeight - srcH / 2, img.naturalHeight - srcH));

        ctx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
        ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, LOUPE_SIZE, LOUPE_SIZE);

        // Position loupe in the diagonal opposite quadrant
        const absX = imageBounds.offsetX + pointX * imageBounds.width;
        const absY = imageBounds.offsetY + pointY * imageBounds.height;

        const loupeLeft = absX < containerWidth / 2
          ? containerWidth - LOUPE_SIZE - MARGIN
          : MARGIN;
        const loupeTop = absY < containerHeight / 2
          ? containerHeight - LOUPE_SIZE - MARGIN
          : MARGIN;

        wrapper.style.left = `${loupeLeft}px`;
        wrapper.style.top = `${loupeTop}px`;
      },
    }));

    return (
      <div
        ref={wrapperRef}
        style={{
          position: "absolute",
          width: LOUPE_SIZE,
          height: LOUPE_SIZE,
          borderRadius: 8,
          border: "2px solid white",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          pointerEvents: "none",
          zIndex: 50,
          overflow: "hidden",
        }}
      >
        <canvas
          ref={canvasRef}
          width={LOUPE_SIZE}
          height={LOUPE_SIZE}
          style={{ width: LOUPE_SIZE, height: LOUPE_SIZE, display: "block" }}
        />
        {/* Crosshair */}
        <svg
          width={LOUPE_SIZE}
          height={LOUPE_SIZE}
          viewBox={`0 0 ${LOUPE_SIZE} ${LOUPE_SIZE}`}
          style={{ position: "absolute", inset: 0 }}
        >
          {/* Shadow lines */}
          <line
            x1={LOUPE_SIZE / 2} y1={0}
            x2={LOUPE_SIZE / 2} y2={LOUPE_SIZE}
            stroke="black" strokeWidth={2} opacity={0.3}
          />
          <line
            x1={0} y1={LOUPE_SIZE / 2}
            x2={LOUPE_SIZE} y2={LOUPE_SIZE / 2}
            stroke="black" strokeWidth={2} opacity={0.3}
          />
          {/* White lines */}
          <line
            x1={LOUPE_SIZE / 2} y1={0}
            x2={LOUPE_SIZE / 2} y2={LOUPE_SIZE}
            stroke="white" strokeWidth={1} opacity={0.9}
          />
          <line
            x1={0} y1={LOUPE_SIZE / 2}
            x2={LOUPE_SIZE} y2={LOUPE_SIZE / 2}
            stroke="white" strokeWidth={1} opacity={0.9}
          />
          {/* Center dot (mimics endpoint handle) */}
          <circle
            cx={LOUPE_SIZE / 2} cy={LOUPE_SIZE / 2} r={4}
            fill="none" stroke="white" strokeWidth={1.5}
            filter="drop-shadow(0 0 1px rgba(0,0,0,0.5))"
          />
        </svg>
      </div>
    );
  }
);
