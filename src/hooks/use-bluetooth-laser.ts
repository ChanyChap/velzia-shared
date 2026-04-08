"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LaserBluetoothService,
  type ConnectionStatus,
  type LaserMeasurement,
} from "@/lib/bluetooth/laser-service";

export interface UseBluetoothLaserReturn {
  status: ConnectionStatus;
  deviceName: string | null;
  lastMeasurement: LaserMeasurement | null;
  isSupported: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  triggerMeasurement: () => Promise<void>;
  error: string | null;
}

export function useBluetoothLaser(): UseBluetoothLaserReturn {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [lastMeasurement, setLastMeasurement] = useState<LaserMeasurement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const serviceRef = useRef<LaserBluetoothService | null>(null);

  useEffect(() => {
    setIsSupported(typeof navigator !== "undefined" && "bluetooth" in navigator);
  }, []);

  useEffect(() => {
    const service = new LaserBluetoothService({
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
        if (newStatus === "disconnected") {
          setDeviceName(null);
        }
      },
      onMeasurement: (measurement) => {
        setLastMeasurement(measurement);
        setDeviceName(measurement.device_name);
        setError(null);
      },
      onError: (err) => {
        setError(err);
      },
    });
    serviceRef.current = service;

    return () => {
      service.disconnect();
    };
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    await serviceRef.current?.connect();
    if (serviceRef.current?.deviceName) {
      setDeviceName(serviceRef.current.deviceName);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await serviceRef.current?.disconnect();
    setLastMeasurement(null);
    setError(null);
  }, []);

  const triggerMeasurement = useCallback(async () => {
    await serviceRef.current?.triggerMeasurement();
  }, []);

  return {
    status,
    deviceName,
    lastMeasurement,
    isSupported,
    connect,
    disconnect,
    triggerMeasurement,
    error,
  };
}
