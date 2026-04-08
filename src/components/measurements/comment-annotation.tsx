"use client";

import type { MeasurementComment } from "@/lib/types";

export type CommentDragTarget = { type: "comment"; commentId: string };

const ICON_MAP: Record<string, string> = {
  warning: "\u26A0",   // Warning sign
  danger: "\u2716",    // Heavy X
  info: "\u2139",      // Info
  check: "\u2714",     // Check mark
};

const FONT_SIZE_MAP: Record<string, number> = {
  small: 11,
  medium: 14,
  large: 18,
};

interface CommentAnnotationProps {
  comment: MeasurementComment;
  containerWidth: number;
  containerHeight: number;
  isSelected?: boolean;
  onClick?: (comment: MeasurementComment) => void;
  onDragStart?: (target: CommentDragTarget, clientX: number, clientY: number, pointerId: number) => void;
}

export function CommentAnnotation({
  comment,
  containerWidth,
  containerHeight,
  isSelected,
  onClick,
  onDragStart,
}: CommentAnnotationProps) {
  const cx = comment.x * containerWidth;
  const cy = comment.y * containerHeight;
  const fontSize = FONT_SIZE_MAP[comment.font_size] || 14;
  const iconChar = ICON_MAP[comment.icon];
  const hasIcon = comment.icon !== "none" && iconChar;
  const hasText = comment.text.trim().length > 0;

  // Measure approximate text width
  const textLen = comment.text.length;
  const textWidth = Math.max(60, Math.min(200, textLen * fontSize * 0.55 + 16));
  const iconSize = fontSize + 6;
  const totalWidth = hasText ? textWidth + (hasIcon ? iconSize + 4 : 0) : (hasIcon ? iconSize + 8 : 40);
  const boxHeight = fontSize + 14;

  const fontWeight = comment.font_style === "bold" ? 700 : 400;
  const fontStyleAttr = comment.font_style === "italic" ? "italic" : "normal";

  return (
    <g
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(comment);
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onDragStart?.({ type: "comment", commentId: comment.id }, e.clientX, e.clientY, e.pointerId);
      }}
      style={{ pointerEvents: "all" }}
    >
      {/* Background pill */}
      <rect
        x={cx - totalWidth / 2}
        y={cy - boxHeight / 2}
        width={totalWidth}
        height={boxHeight}
        rx={6}
        fill={isSelected ? "rgba(59,130,246,0.9)" : "rgba(0,0,0,0.75)"}
        stroke={isSelected ? "#3b82f6" : "rgba(255,255,255,0.3)"}
        strokeWidth={1}
      />

      {/* Icon */}
      {hasIcon && (
        <text
          x={cx - totalWidth / 2 + 8}
          y={cy + fontSize / 3}
          fill={comment.icon === "warning" ? "#fbbf24" : comment.icon === "danger" ? "#ef4444" : comment.icon === "info" ? "#60a5fa" : "#22c55e"}
          fontSize={fontSize + 2}
          style={{ pointerEvents: "none" }}
        >
          {iconChar}
        </text>
      )}

      {/* Text */}
      {hasText && (
        <text
          x={cx - totalWidth / 2 + (hasIcon ? iconSize + 8 : 8)}
          y={cy + fontSize / 3}
          fill={comment.color || "#ffffff"}
          fontSize={fontSize}
          fontWeight={fontWeight}
          fontStyle={fontStyleAttr}
          style={{ pointerEvents: "none" }}
        >
          {comment.text.length > 25 ? comment.text.slice(0, 24) + "\u2026" : comment.text}
        </text>
      )}

      {/* No text, no icon fallback */}
      {!hasText && !hasIcon && (
        <text
          x={cx}
          y={cy + fontSize / 3}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize={fontSize}
          fontStyle="italic"
          style={{ pointerEvents: "none" }}
        >
          nota
        </text>
      )}
    </g>
  );
}
