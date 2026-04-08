/**
 * Bluetooth laser distance meter service
 * Handles scanning, connecting, subscribing to measurements,
 * and auto-reconnection with exponential backoff.
 *
 * Supports:
 * - Leica DISTO (single characteristic, direct values)
 * - Bosch GLM 50-27 C (MT Protocol: dual TX/RX characteristics, fragmented frames)
 */

import { detectDriver, detectDriverByService, getRequestDeviceOptions, type LaserDriver } from "./laser-parsers";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface LaserMeasurement {
  value_mm: number;
  timestamp: number;
  device_name: string;
}

export interface LaserServiceCallbacks {
  onStatusChange: (status: ConnectionStatus) => void;
  onMeasurement: (measurement: LaserMeasurement) => void;
  onError: (error: string) => void;
}

export class LaserBluetoothService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private rxCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private txCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private driver: LaserDriver | null = null;
  private callbacks: LaserServiceCallbacks;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _status: ConnectionStatus = "disconnected";

  constructor(callbacks: LaserServiceCallbacks) {
    this.callbacks = callbacks;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  get deviceName(): string | null {
    return this.device?.name ?? null;
  }

  get isSupported(): boolean {
    return typeof navigator !== "undefined" && "bluetooth" in navigator;
  }

  private setStatus(status: ConnectionStatus) {
    this._status = status;
    this.callbacks.onStatusChange(status);
  }

  /**
   * Request device and connect.
   * Must be called from a user gesture (click/touch).
   */
  async connect(): Promise<void> {
    if (!this.isSupported) {
      this.callbacks.onError("Web Bluetooth no soportado en este navegador");
      return;
    }

    try {
      this.setStatus("connecting");

      // Request device with service UUID + name prefix filters
      this.device = await navigator.bluetooth.requestDevice(getRequestDeviceOptions());

      if (!this.device) {
        this.setStatus("disconnected");
        return;
      }

      // Listen for disconnection
      this.device.addEventListener("gattserverdisconnected", () => {
        this.handleDisconnection();
      });

      await this.connectToDevice();
    } catch (err: unknown) {
      const error = err as { name?: string; code?: number; message?: string };
      // User cancelled the dialog
      if (error.name === "NotFoundError" || error.code === 8) {
        this.setStatus("disconnected");
        return;
      }
      this.callbacks.onError(`Error al conectar: ${error.message}`);
      this.setStatus("disconnected");
    }
  }

  private async connectToDevice(): Promise<void> {
    if (!this.device?.gatt) {
      this.setStatus("disconnected");
      return;
    }

    try {
      this.server = await this.device.gatt.connect();

      // Detect driver: first try by name, then by probing services
      const nameDriver = detectDriver(this.device.name || "");
      let service: BluetoothRemoteGATTService;
      try {
        service = await this.server.getPrimaryService(nameDriver.serviceUUID);
        this.driver = nameDriver;
      } catch {
        // Name-based detection failed, probe all known services
        const probed = await detectDriverByService(this.server);
        if (!probed) {
          this.callbacks.onError("No se encontró un servicio compatible en el dispositivo");
          this.setStatus("disconnected");
          return;
        }
        this.driver = probed;
        service = await this.server.getPrimaryService(probed.serviceUUID);
      }

      // Reset reassembly buffer for fragmented protocols
      this.driver.resetReassembly?.();

      // Get RX characteristic (notifications)
      this.rxCharacteristic = await service.getCharacteristic(this.driver.rxCharacteristicUUID);

      // Get TX characteristic (write commands) — may be same as RX or separate
      if (this.driver.txCharacteristicUUID && this.driver.txCharacteristicUUID !== this.driver.rxCharacteristicUUID) {
        this.txCharacteristic = await service.getCharacteristic(this.driver.txCharacteristicUUID);
      } else {
        this.txCharacteristic = this.rxCharacteristic;
      }

      // Subscribe to notifications/indications on RX
      await this.rxCharacteristic.startNotifications();
      this.rxCharacteristic.addEventListener(
        "characteristicvaluechanged",
        this.handleNotification
      );

      this.reconnectAttempts = 0;
      this.setStatus("connected");
    } catch (err: unknown) {
      const error = err as { message?: string };
      this.callbacks.onError(`Error al conectar al servicio: ${error.message}`);
      this.setStatus("disconnected");
    }
  }

  private handleNotification = (event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const rawData = characteristic.value;
    if (!rawData || !this.driver) return;

    let frameData: DataView | null;

    if (this.driver.fragmented && this.driver.reassemble) {
      // Fragmented protocol: reassemble first
      frameData = this.driver.reassemble(rawData);
      if (!frameData) return; // waiting for more fragments
    } else {
      // Simple protocol: data is complete
      frameData = rawData;
    }

    const value_mm = this.driver.parseNotification(frameData);
    if (value_mm !== null) {
      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      this.callbacks.onMeasurement({
        value_mm,
        timestamp: Date.now(),
        device_name: this.device?.name || "Desconocido",
      });
    }
  };

  /**
   * Trigger a remote measurement (Bosch GLM).
   * Writes the command to the TX characteristic.
   */
  async triggerMeasurement(): Promise<void> {
    if (!this.txCharacteristic || !this.driver) return;

    const command = this.driver.getMeasureCommand?.();
    if (command) {
      try {
        await this.txCharacteristic.writeValueWithResponse(command as unknown as BufferSource);
      } catch (err: unknown) {
        const error = err as { message?: string };
        // Some devices prefer writeWithoutResponse
        try {
          await this.txCharacteristic.writeValueWithoutResponse(command as unknown as BufferSource);
        } catch {
          this.callbacks.onError(`Error al disparar medición: ${error.message}`);
        }
      }
    }
  }

  private handleDisconnection = () => {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.setStatus("reconnecting");
      const delay = Math.pow(2, this.reconnectAttempts) * 1000; // 1s, 2s, 4s
      this.reconnectAttempts++;

      this.reconnectTimer = setTimeout(async () => {
        try {
          await this.connectToDevice();
        } catch {
          this.handleDisconnection();
        }
      }, delay);
    } else {
      this.setStatus("disconnected");
      this.callbacks.onError("Se perdió la conexión con el medidor. Reconecta manualmente.");
    }
  };

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.rxCharacteristic) {
      try {
        this.rxCharacteristic.removeEventListener(
          "characteristicvaluechanged",
          this.handleNotification
        );
        await this.rxCharacteristic.stopNotifications();
      } catch {
        // Ignore errors during cleanup
      }
      this.rxCharacteristic = null;
    }

    this.txCharacteristic = null;

    if (this.server?.connected) {
      this.server.disconnect();
    }

    this.server = null;
    this.device = null;
    this.driver = null;
    this.reconnectAttempts = 0;
    this.setStatus("disconnected");
  }
}
