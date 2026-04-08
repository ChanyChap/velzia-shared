"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Clock, MapPin, Loader2 } from "lucide-react";
import type { Shift } from "@/lib/types";

interface ClockButtonProps {
  activeShift: Shift | null;
  onClockIn: (lat?: number, lng?: number) => Promise<void>;
  onClockOut: (lat?: number, lng?: number) => Promise<void>;
}

export function ClockButton({ activeShift, onClockIn, onClockOut }: ClockButtonProps) {
  const [loading, setLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  async function getPosition(): Promise<{ lat: number; lng: number } | null> {
    if (!navigator.geolocation) {
      setGpsStatus("GPS no disponible");
      return null;
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsStatus(null);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          setGpsStatus("No se pudo obtener ubicación");
          resolve(null);
        },
        { timeout: 10000, enableHighAccuracy: true }
      );
    });
  }

  async function handleClick() {
    setLoading(true);
    try {
      const pos = await getPosition();
      if (activeShift) {
        await onClockOut(pos?.lat, pos?.lng);
      } else {
        await onClockIn(pos?.lat, pos?.lng);
      }
    } finally {
      setLoading(false);
    }
  }

  const isActive = !!activeShift;

  return (
    <div className="flex flex-col items-center gap-3">
      <Button
        onClick={handleClick}
        disabled={loading}
        size="lg"
        className={`h-32 w-32 rounded-full text-lg font-bold shadow-lg transition-all ${
          isActive
            ? "bg-red-500 hover:bg-red-600 text-white"
            : "bg-green-500 hover:bg-green-600 text-white"
        }`}
      >
        {loading ? (
          <Loader2 className="h-8 w-8 animate-spin" />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Clock className="h-8 w-8" />
            <span className="text-sm">{isActive ? "Salida" : "Entrada"}</span>
          </div>
        )}
      </Button>
      {gpsStatus && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3" /> {gpsStatus}
        </p>
      )}
      {isActive && activeShift && (
        <p className="text-sm text-muted-foreground">
          Entrada: {new Date(activeShift.clock_in).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}
