"use client";

import { Button } from "@/components/ui/button";
import { Bluetooth, BluetoothOff, Loader2 } from "lucide-react";
import type { ConnectionStatus } from "@/lib/bluetooth/laser-service";
import { cn } from "@/lib/utils";

interface BluetoothManagerProps {
  status: ConnectionStatus;
  deviceName: string | null;
  isSupported: boolean;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

const STATUS_CONFIG: Record<ConnectionStatus, { color: string; label: string }> = {
  disconnected: { color: "bg-gray-100 text-gray-600 border-gray-200", label: "Desconectado" },
  connecting: { color: "bg-blue-100 text-blue-600 border-blue-200", label: "Conectando..." },
  connected: { color: "bg-green-100 text-green-700 border-green-200", label: "Conectado" },
  reconnecting: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Reconectando..." },
};

export function BluetoothManager({
  status,
  deviceName,
  isSupported,
  error,
  onConnect,
  onDisconnect,
}: BluetoothManagerProps) {
  if (!isSupported) {
    // Detect iOS (no browser on iOS supports Web Bluetooth)
    const isIOS = typeof navigator !== "undefined" &&
      /iPad|iPhone|iPod/.test(navigator.userAgent);

    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full gap-2 border bg-gray-100 text-gray-400 border-gray-200"
          disabled
        >
          <BluetoothOff className="h-4 w-4" />
          Láser BT
        </Button>
        <span className="text-xs text-amber-600 max-w-[220px] text-right">
          {isIOS
            ? "Web Bluetooth no disponible en iOS. Usa Chrome en Android."
            : "Bluetooth no soportado. Usa Chrome en Android o escritorio."}
        </span>
      </div>
    );
  }

  const config = STATUS_CONFIG[status];
  const isLoading = status === "connecting" || status === "reconnecting";

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        className={cn("rounded-full gap-2 border", config.color)}
        onClick={status === "connected" ? onDisconnect : onConnect}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : status === "connected" ? (
          <Bluetooth className="h-4 w-4" />
        ) : (
          <BluetoothOff className="h-4 w-4" />
        )}
        {status === "connected" && deviceName ? deviceName : config.label}
      </Button>
      {error && (
        <span className="text-xs text-red-500 max-w-[200px] text-right">{error}</span>
      )}
    </div>
  );
}
