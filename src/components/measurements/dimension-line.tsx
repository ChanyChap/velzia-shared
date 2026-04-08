"use client";

import type { MeasurementPoint, MeasurementValidationStatus } from "@/lib/types";

const VALIDATION_COLORS: Record<MeasurementValidationStatus, string> = {
  pending: "#94a3b8",   // slate-400
  ok: "#22c55e",        // green-500
  warning: "#f59e0b",   // amber-500
  error: "#ef4444",     // red-500
};

export type DragTarget =
  | { type: "label"; pointId: string }
  | { type: "endpoint1"; pointId: string }
  | { type: "endpoint2"; pointId: string };

interface DimensionLineProps {
  point: MeasurementPoint;
  containerWidth: number;
  containerHeight: number;
  isSelected?: boolean;
  scale?: number;
  onClick?: (point: MeasurementPoint) => void;
  onDoubleClick?: (point: MeasurementPoint) => void;
  onDragStart?: (target: DragTarget, clientX: number, clientY: number, pointerId: number) => void;
}

export function DimensionLine({
  point,
  containerWidth,
  containerHeight,
  isSelected,
  scale = 1,
  onClick,
  onDoubleClick,
  onDragStart,
}: DimensionLineProps) {
  const color = VALIDATION_COLORS[point.validation_status];
  const x1 = point.x1 * containerWidth;
  const y1 = point.y1 * containerHeight;
  const x2 = point.x2 * containerWidth;
  const y2 = point.y2 * containerHeight;

  // Midpoint for label
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  // Responsive sizing based on scale
  const arrowSize = Math.max(10, 14 / scale);
  const hitAreaWidth = Math.max(30, 44 / scale);
  const labelWidth = Math.max(90, 110 / scale);
  const labelHeight = Math.max(32, 40 / scale);
  const fontValue = Math.max(12, 16 / scale);
  const fontLabel = Math.max(10, 13 / scale);
  const handleRadius = Math.max(12, 18 / scale);

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const isDashed = point.origin === "ai_detected" && point.value_mm === null;
  const strokeWidth = isSelected ? 3 : 2;

  // Arrow points for start
  const a1x1 = x1 + arrowSize * Math.cos(angle - Math.PI / 6);
  const a1y1 = y1 + arrowSize * Math.sin(angle - Math.PI / 6);
  const a1x2 = x1 + arrowSize * Math.cos(angle + Math.PI / 6);
  const a1y2 = y1 + arrowSize * Math.sin(angle + Math.PI / 6);

  // Arrow points for end
  const a2x1 = x2 - arrowSize * Math.cos(angle - Math.PI / 6);
  const a2y1 = y2 - arrowSize * Math.sin(angle - Math.PI / 6);
  const a2x2 = x2 - arrowSize * Math.cos(angle + Math.PI / 6);
  const a2y2 = y2 - arrowSize * Math.sin(angle + Math.PI / 6);

  // Value text
  const displayValue = point.value_mm !== null ? `${point.value_mm} mm` : "—";

  return (
    <g
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(point);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.(point);
      }}
      style={{ pointerEvents: "all" }}
    >
      {/* Hit area (invisible wider line for easier touch) */}
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="transparent"
        strokeWidth={hitAreaWidth}
      />
      {/* Main line */}
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={isDashed ? "6 4" : undefined}
      />
      {/* Arrow start */}
      <polygon
        points={`${x1},${y1} ${a1x1},${a1y1} ${a1x2},${a1y2}`}
        fill={color}
      />
      {/* Arrow end */}
      <polygon
        points={`${x2},${y2} ${a2x1},${a2y1} ${a2x2},${a2y2}`}
        fill={color}
      />
      {/* Label background */}
      <rect
        x={mx - labelWidth / 2}
        y={my - labelHeight / 2 - 4}
        width={labelWidth}
        height={labelHeight}
        rx={4}
        fill={isSelected ? color : "rgba(0,0,0,0.7)"}
        stroke={color}
        strokeWidth={1}
        onPointerDown={(e) => {
          if (onDragStart) {
            e.stopPropagation();
            onDragStart({ type: "label", pointId: point.id }, e.clientX, e.clientY, e.pointerId);
          }
        }}
      />
      {/* Label text */}
      <text
        x={mx}
        y={my - labelHeight / 2 + fontLabel + 2}
        textAnchor="middle"
        fill="white"
        fontSize={fontLabel}
        fontWeight={500}
        style={{ pointerEvents: "none" }}
      >
        {point.label}
      </text>
      {/* Value text */}
      <text
        x={mx}
        y={my - labelHeight / 2 + fontLabel + fontValue + 4}
        textAnchor="middle"
        fill="white"
        fontSize={fontValue}
        fontWeight={700}
        style={{ pointerEvents: "none" }}
      >
        {displayValue}
      </text>
      {/* BT icon indicator */}
      {point.value_source === "bluetooth" && (
        <text
          x={mx + labelWidth / 2 - 5}
          y={my + 3}
          textAnchor="middle"
          fill={color}
          fontSize={fontLabel}
        >
          BT
        </text>
      )}
      {/* Drag handles on endpoints when selected */}
      {isSelected && (
        <>
          <circle
            cx={x1}
            cy={y1}
            r={handleRadius}
            fill="white"
            stroke={color}
            strokeWidth={2}
            style={{ cursor: "grab", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onDragStart?.({ type: "endpoint1", pointId: point.id }, e.clientX, e.clientY, e.pointerId);
            }}
          />
          <circle
            cx={x2}
            cy={y2}
            r={handleRadius}
            fill="white"
            stroke={color}
            strokeWidth={2}
            style={{ cursor: "grab", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onDragStart?.({ type: "endpoint2", pointId: point.id }, e.clientX, e.clientY, e.pointerId);
            }}
          />
        </>
      )}
    </g>
  );
}
