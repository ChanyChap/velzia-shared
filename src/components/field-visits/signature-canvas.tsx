"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

interface SignatureCanvasProps {
  onSignatureChange: (dataUrl: string | null) => void;
  width?: number;
  height?: number;
}

export function SignatureCanvas({ onSignatureChange, width: propWidth, height: propHeight }: SignatureCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ w: propWidth || 500, h: propHeight || 200 });

  // Responsive: measure container width
  useEffect(() => {
    function measure() {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const w = propWidth ? Math.min(propWidth, containerWidth) : containerWidth;
        const h = propHeight || Math.max(180, Math.min(w * 0.4, 220));
        setCanvasSize({ w, h });
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [propWidth, propHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.w * dpr;
    canvas.height = canvasSize.h * dpr;
    canvas.style.width = `${canvasSize.w}px`;
    canvas.style.height = `${canvasSize.h}px`;
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);

    // Signature line
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, canvasSize.h - 40);
    ctx.lineTo(canvasSize.w - 20, canvasSize.h - 40);
    ctx.stroke();

    ctx.fillStyle = "#9ca3af";
    ctx.font = "13px sans-serif";
    ctx.fillText("Firma del cliente", 20, canvasSize.h - 20);

    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;

    setHasSignature(false);
    onSignatureChange(null);
  }, [canvasSize]);

  const getCoords = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  }, []);

  const startDrawing = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  }, [getCoords]);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }, [isDrawing, getCoords]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (hasSignature && canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      onSignatureChange(dataUrl);
    }
  }, [isDrawing, hasSignature, onSignatureChange]);

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);

    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, canvasSize.h - 40);
    ctx.lineTo(canvasSize.w - 20, canvasSize.h - 40);
    ctx.stroke();

    ctx.fillStyle = "#9ca3af";
    ctx.font = "13px sans-serif";
    ctx.fillText("Firma del cliente", 20, canvasSize.h - 20);

    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;

    setHasSignature(false);
    onSignatureChange(null);
  }

  return (
    <div ref={containerRef} className="space-y-3 w-full">
      <div
        className="border-2 border-dashed border-muted-foreground/30 rounded-xl overflow-hidden bg-white touch-none"
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: canvasSize.h, display: "block" }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {hasSignature ? "Firma registrada" : "Dibuja tu firma en el recuadro"}
        </p>
        {hasSignature && (
          <Button variant="outline" size="sm" className="h-10 rounded-lg" onClick={clearSignature}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Borrar
          </Button>
        )}
      </div>
    </div>
  );
}
