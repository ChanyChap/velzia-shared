"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import type { MeasurementPhoto, MeasurementPoint, MeasurementComment } from "@/lib/types";
import { DimensionLine } from "./dimension-line";
import type { DragTarget } from "./dimension-line";
import { CommentAnnotation } from "./comment-annotation";
import type { CommentDragTarget } from "./comment-annotation";
import { DragLoupe } from "./drag-loupe";
import type { DragLoupeHandle } from "./drag-loupe";

interface DragState {
  target: DragTarget | CommentDragTarget;
  startX: number;
  startY: number;
  originalCoords: { x1: number; y1: number; x2: number; y2: number };
  isDragging: boolean;
}

interface PhotoAnnotationCanvasProps {
  photo: MeasurementPhoto;
  points: MeasurementPoint[];
  comments?: MeasurementComment[];
  selectedPointId?: string | null;
  selectedCommentId?: string | null;
  onPointSelect?: (point: MeasurementPoint) => void;
  onPointHighlight?: (point: MeasurementPoint) => void;
  onPointDragEnd?: (pointId: string, coords: { x1: number; y1: number; x2: number; y2: number }) => void;
  onCommentSelect?: (comment: MeasurementComment) => void;
  onCommentDragEnd?: (commentId: string, coords: { x: number; y: number }) => void;
  onCanvasClick?: (normalizedX: number, normalizedY: number) => void;
  onDragActiveChange?: (active: boolean) => void;
  className?: string;
}

export function PhotoAnnotationCanvas({
  photo,
  points,
  comments = [],
  selectedPointId,
  selectedCommentId,
  onPointSelect,
  onPointHighlight,
  onPointDragEnd,
  onCommentSelect,
  onCommentDragEnd,
  onCanvasClick,
  onDragActiveChange,
  className,
}: PhotoAnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverrides, setDragOverrides] = useState<Map<string, { x1: number; y1: number; x2: number; y2: number }>>(new Map());
  const imgRef = useRef<HTMLImageElement>(null);
  const loupeRef = useRef<DragLoupeHandle>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  // Track container dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Calculate where the image actually renders within the container (object-contain)
  const imageBounds = useMemo(() => {
    if (!naturalSize || dimensions.width === 0 || dimensions.height === 0) {
      return { offsetX: 0, offsetY: 0, width: dimensions.width, height: dimensions.height };
    }
    const containerRatio = dimensions.width / dimensions.height;
    const imageRatio = naturalSize.w / naturalSize.h;
    if (imageRatio > containerRatio) {
      // Image wider → letterbox top/bottom
      const h = dimensions.width / imageRatio;
      return { offsetX: 0, offsetY: (dimensions.height - h) / 2, width: dimensions.width, height: h };
    }
    // Image taller → letterbox left/right
    const w = dimensions.height * imageRatio;
    return { offsetX: (dimensions.width - w) / 2, offsetY: 0, width: w, height: dimensions.height };
  }, [naturalSize, dimensions]);

  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (img) setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  const handleDragStart = useCallback((target: DragTarget, clientX: number, clientY: number, pointerId: number) => {
    const point = points.find((p) => p.id === target.pointId);
    if (!point) return;
    const override = dragOverrides.get(target.pointId);
    const coords = override ?? { x1: point.x1, y1: point.y1, x2: point.x2, y2: point.y2 };
    svgRef.current?.setPointerCapture(pointerId);
    setDragState({
      target,
      startX: clientX,
      startY: clientY,
      originalCoords: coords,
      isDragging: false,
    });
  }, [points, dragOverrides]);

  const handleCommentDragStart = useCallback((target: CommentDragTarget, clientX: number, clientY: number, pointerId: number) => {
    const comment = comments.find((c) => c.id === target.commentId);
    if (!comment) return;
    const override = dragOverrides.get(`comment-${target.commentId}`);
    const coords = override ?? { x1: comment.x, y1: comment.y, x2: comment.x, y2: comment.y };
    svgRef.current?.setPointerCapture(pointerId);
    setDragState({
      target,
      startX: clientX,
      startY: clientY,
      originalCoords: coords,
      isDragging: false,
    });
  }, [comments, dragOverrides]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragState || imageBounds.width === 0 || imageBounds.height === 0) return;

    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Threshold to distinguish tap from drag
    if (!dragState.isDragging && dist < 5) return;

    if (!dragState.isDragging) {
      setDragState((prev) => prev ? { ...prev, isDragging: true } : null);
      onDragActiveChange?.(true);
    }

    const ndx = dx / imageBounds.width;  // Normalized delta against image area
    const ndy = dy / imageBounds.height;

    const { originalCoords, target } = dragState;
    let newCoords: { x1: number; y1: number; x2: number; y2: number };

    if (target.type === "comment") {
      // Move comment (single point)
      newCoords = {
        x1: clamp(originalCoords.x1 + ndx),
        y1: clamp(originalCoords.y1 + ndy),
        x2: clamp(originalCoords.x1 + ndx),
        y2: clamp(originalCoords.y1 + ndy),
      };
      loupeRef.current?.update(newCoords.x1, newCoords.y1);
      setDragOverrides((prev) => {
        const next = new Map(prev);
        next.set(`comment-${target.commentId}`, newCoords);
        return next;
      });
      return;
    }

    if (target.type === "label") {
      newCoords = {
        x1: clamp(originalCoords.x1 + ndx),
        y1: clamp(originalCoords.y1 + ndy),
        x2: clamp(originalCoords.x2 + ndx),
        y2: clamp(originalCoords.y2 + ndy),
      };
    } else if (target.type === "endpoint1") {
      newCoords = {
        x1: clamp(originalCoords.x1 + ndx),
        y1: clamp(originalCoords.y1 + ndy),
        x2: originalCoords.x2,
        y2: originalCoords.y2,
      };
    } else {
      newCoords = {
        x1: originalCoords.x1,
        y1: originalCoords.y1,
        x2: clamp(originalCoords.x2 + ndx),
        y2: clamp(originalCoords.y2 + ndy),
      };
    }

    if (target.type === "endpoint1") {
      loupeRef.current?.update(newCoords.x1, newCoords.y1);
    } else if (target.type === "endpoint2") {
      loupeRef.current?.update(newCoords.x2, newCoords.y2);
    } else {
      loupeRef.current?.update(
        (newCoords.x1 + newCoords.x2) / 2,
        (newCoords.y1 + newCoords.y2) / 2
      );
    }

    setDragOverrides((prev) => {
      const next = new Map(prev);
      next.set(target.pointId, newCoords);
      return next;
    });
  }, [dragState, imageBounds, onDragActiveChange]);

  const handlePointerUp = useCallback((_e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragState) return;
    const { target } = dragState;

    if (target.type === "comment") {
      const key = `comment-${target.commentId}`;
      if (dragState.isDragging) {
        const override = dragOverrides.get(key);
        if (override && onCommentDragEnd) {
          onCommentDragEnd(target.commentId, { x: override.x1, y: override.y1 });
        }
        onDragActiveChange?.(false);
      } else {
        const comment = comments.find((c) => c.id === target.commentId);
        if (comment) onCommentSelect?.(comment);
        setDragOverrides((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      }
      setDragState(null);
      return;
    }

    if (dragState.isDragging) {
      const override = dragOverrides.get(target.pointId);
      if (override && onPointDragEnd) {
        onPointDragEnd(target.pointId, override);
      }
      onDragActiveChange?.(false);
    } else {
      const point = points.find((p) => p.id === target.pointId);
      if (point) {
        // Single tap always highlights (listening mode for laser)
        onPointHighlight?.(point);
      }
      setDragOverrides((prev) => {
        const next = new Map(prev);
        next.delete(target.pointId);
        return next;
      });
    }

    setDragState(null);
  }, [dragState, dragOverrides, onPointDragEnd, onPointHighlight, onCommentSelect, onCommentDragEnd, onDragActiveChange, points, comments]);

  // Clear stale drag overrides once server data catches up (smart comparison)
  useEffect(() => {
    if (dragOverrides.size > 0 && !dragState) {
      setDragOverrides(prev => {
        const next = new Map<string, { x1: number; y1: number; x2: number; y2: number }>();
        prev.forEach((override, pointId) => {
          const sp = points.find(p => p.id === pointId);
          if (!sp) return; // point deleted, drop override
          const synced =
            Math.abs(sp.x1 - override.x1) < 0.001 &&
            Math.abs(sp.y1 - override.y1) < 0.001 &&
            Math.abs(sp.x2 - override.x2) < 0.001 &&
            Math.abs(sp.y2 - override.y2) < 0.001;
          if (!synced) next.set(pointId, override);
        });
        return next;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!onCanvasClick || !containerRef.current || imageBounds.width === 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - imageBounds.offsetX) / imageBounds.width;
      const y = (e.clientY - rect.top - imageBounds.offsetY) / imageBounds.height;
      onCanvasClick(Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)));
    },
    [onCanvasClick, imageBounds]
  );

  // Build points with drag overrides applied
  const displayPoints = dragOverrides.size === 0 ? points : points.map((p) => {
    const override = dragOverrides.get(p.id);
    if (!override) return p;
    return { ...p, ...override };
  });

  // Build comments with drag overrides applied
  const displayComments = dragOverrides.size === 0 ? comments : comments.map((c) => {
    const override = dragOverrides.get(`comment-${c.id}`);
    if (!override) return c;
    return { ...c, x: override.x1, y: override.y1 };
  });

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-gray-900 overflow-hidden ${className || ""}`}
      style={{ minHeight: "300px", touchAction: "none" }}
    >
      {/* Photo background */}
      <img
        ref={imgRef}
        src={photo.url}
        alt={photo.filename}
        className="w-full h-full object-contain"
        draggable={false}
        onLoad={handleImgLoad}
      />
      {/* SVG overlay */}
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        preserveAspectRatio="none"
        onClick={handleCanvasClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: "none" }}
      >
        <g transform={`translate(${imageBounds.offsetX}, ${imageBounds.offsetY})`}>
          {naturalSize && imageBounds.width > 0 && imageBounds.height > 0 && (
            <>
              {displayPoints.map((point) => (
                <DimensionLine
                  key={point.id}
                  point={point}
                  containerWidth={imageBounds.width}
                  containerHeight={imageBounds.height}
                  isSelected={point.id === selectedPointId}
                  scale={1}
                  onClick={onPointHighlight}
                  onDoubleClick={onPointSelect}
                  onDragStart={handleDragStart}
                />
              ))}
              {displayComments.map((comment) => (
                <CommentAnnotation
                  key={comment.id}
                  comment={comment}
                  containerWidth={imageBounds.width}
                  containerHeight={imageBounds.height}
                  isSelected={comment.id === selectedCommentId}
                  onClick={onCommentSelect}
                  onDragStart={handleCommentDragStart}
                />
              ))}
            </>
          )}
        </g>
      </svg>
      {/* Loading spinner while image loads */}
      {!naturalSize && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-8 w-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
      {/* Magnifying loupe during drag */}
      {dragState?.isDragging && (
        <DragLoupe
          ref={loupeRef}
          imgRef={imgRef}
          imageBounds={imageBounds}
          containerWidth={dimensions.width}
          containerHeight={dimensions.height}
        />
      )}
    </div>
  );
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}
