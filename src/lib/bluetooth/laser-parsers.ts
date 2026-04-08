/**
 * Laser distance meter BLE protocol parsers
 * Supports: Leica DISTO (D1, D2, D510...) and Bosch GLM 50-27 C (MT Protocol)
 */

// ========================================
// Driver interface
// ========================================

export interface LaserDriver {
  readonly manufacturer: string;
  readonly serviceUUID: string;
  /** Characteristic for receiving data (notifications) */
  readonly rxCharacteristicUUID: string;
  /** Characteristic for sending commands (write). Null = same as rx */
  readonly txCharacteristicUUID: string | null;
  /** Parse a raw BLE notification into distance in mm, or null if not a measurement */
  parseNotification(data: DataView): number | null;
  /** Build a command frame to trigger a measurement */
  getMeasureCommand?(): Uint8Array;
  /** Does this driver use fragmented frames that need reassembly? */
  readonly fragmented: boolean;
  /** For fragmented protocols: reassemble fragments into a complete frame */
  reassemble?(fragment: DataView): DataView | null;
  /** Reset reassembly buffer (on new connection) */
  resetReassembly?(): void;
}

// ========================================
// CRC-8 for Bosch MT Protocol
// ========================================

const CRC8_POLY = 0xa6;
const CRC8_INIT = 0xaa;

function crc8(data: Uint8Array): number {
  let crc = CRC8_INIT;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ CRC8_POLY) & 0xff;
      } else {
        crc = (crc << 1) & 0xff;
      }
    }
  }
  return crc;
}

// ========================================
// Leica DISTO Driver
// ========================================

export class LeicaDistoDriver implements LaserDriver {
  readonly manufacturer = "Leica";
  readonly serviceUUID = "3ab10100-f831-4395-b29d-570977d5bf94";
  readonly rxCharacteristicUUID = "3ab10101-f831-4395-b29d-570977d5bf94";
  readonly txCharacteristicUUID = null;
  readonly fragmented = false;

  parseNotification(data: DataView): number | null {
    try {
      // Leica DISTO sends Float32 LE in meters
      if (data.byteLength < 4) return null;
      const meters = data.getFloat32(0, true);
      if (isNaN(meters) || meters <= 0 || meters > 300) return null;
      return Math.round(meters * 1000);
    } catch {
      return null;
    }
  }
}

// ========================================
// Bosch GLM 50-27 C Driver (MT Protocol)
// ========================================

/**
 * Bosch GLM uses the MT (Measurement Transfer) Protocol over BLE.
 * - Service: 00005301-0000-0041-5253-534F46540000
 * - TX (write commands): 00004301-0000-0041-5253-534F46540000
 * - RX (notifications):  00004302-0000-0041-5253-534F46540000
 *
 * Protocol uses fragmented frames (max 20 bytes per BLE notification).
 * Each fragment has a header byte: [seqNo(4 bits) | fragIndex(4 bits)]
 * When fragIndex == 0, the frame is complete.
 *
 * Complete frame format:
 *   [frameType+status(1)] [command(1)] [payloadLength(1)] [payload...] [crc8(1)]
 *
 * frameType is bits 7-6: 0x00 = response, 0xC0 = request
 * command 0x50 = control (trigger measurement)
 * command 0x51 = get measurements (sync container)
 *
 * GLMSyncContainer (33 bytes payload) contains measurement result
 * as Int32 LE at offset 16, in units of 0.05mm (divide by 20 for mm).
 */
export class BoschGLMDriver implements LaserDriver {
  readonly manufacturer = "Bosch";
  readonly serviceUUID = "00005301-0000-0041-5253-534f46540000";
  readonly rxCharacteristicUUID = "00004302-0000-0041-5253-534f46540000";
  readonly txCharacteristicUUID = "00004301-0000-0041-5253-534f46540000";
  readonly fragmented = true;

  private rxBuffer: Uint8Array[] = [];
  private lastSeqNo = -1;
  private txSeqNo = 0;

  resetReassembly() {
    this.rxBuffer = [];
    this.lastSeqNo = -1;
  }

  /**
   * Reassemble fragmented BLE notifications into complete frames.
   * Returns null until a complete frame is assembled.
   */
  reassemble(fragment: DataView): DataView | null {
    if (fragment.byteLength < 1) return null;

    const header = fragment.getUint8(0);

    // 0xFF = flow control (device asking us to send), ignore
    if (header === 0xff) return null;

    const seqNo = (header >> 4) & 0x0f;
    const fragIndex = header & 0x0f;

    // Extract payload (skip header byte)
    const payload = new Uint8Array(fragment.byteLength - 1);
    for (let i = 0; i < payload.length; i++) {
      payload[i] = fragment.getUint8(i + 1);
    }

    // New sequence = new frame
    if (seqNo !== this.lastSeqNo) {
      this.rxBuffer = [];
      this.lastSeqNo = seqNo;
    }

    this.rxBuffer.push(payload);

    // fragIndex == 0 means this is the last (or only) fragment
    if (fragIndex === 0) {
      // Combine all fragments
      const totalLen = this.rxBuffer.reduce((s, b) => s + b.length, 0);
      const frame = new Uint8Array(totalLen);
      let offset = 0;
      for (const buf of this.rxBuffer) {
        frame.set(buf, offset);
        offset += buf.length;
      }
      this.rxBuffer = [];

      // Validate CRC
      if (frame.length >= 4 && crc8(frame) === 0) {
        return new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
      }
      // CRC failed, discard
      return null;
    }

    return null; // waiting for more fragments
  }

  /**
   * Parse a complete reassembled frame for a distance measurement.
   * Looks for sync container responses (command 0x50 or 0x51).
   */
  parseNotification(data: DataView): number | null {
    try {
      if (data.byteLength < 4) return null;

      const frameTypeByte = data.getUint8(0);
      const command = data.getUint8(1);
      // byte 2 = payloadLen (used implicitly via data.byteLength check)
      const frameType = (frameTypeByte >> 6) & 0x03;

      // We want response frames (frameType 0) for control/sync commands
      if (frameType !== 0) return null;
      if (command !== 0x50 && command !== 0x51) return null;

      // Payload starts at offset 3 in the frame
      // GLMSyncContainer layout (33 bytes):
      //   byte 0: measurementType(5b) + calcIndicator(3b)
      //   byte 1: distRef(3b) + angleRef(3b) + unit(1b)
      //   byte 2: stateOfCharge
      //   byte 3: temperature
      //   bytes 4-7:   Float32 LE = dist1 (primary distance in meters)
      //   bytes 8-11:  Float32 LE = dist2
      //   bytes 12-15: Float32 LE = dist3
      //   bytes 16-19: Float32 LE = result (calculated result)
      const dist1Offset = 3 + 4; // frame header(3) + payload offset to dist1(4)
      if (data.byteLength < dist1Offset + 4) return null;

      const meters = data.getFloat32(dist1Offset, true);
      if (isNaN(meters) || meters <= 0 || meters > 300) return null;

      return Math.round(meters * 1000); // mm
    } catch {
      return null;
    }
  }

  /**
   * Build a "trigger measurement" command frame.
   * Command 0x50 (control): measurementType=1 (single distance), distReference=0 (back)
   */
  getMeasureCommand(): Uint8Array {
    // Payload: 2 bytes
    // byte 0: measurementType=1 shifted into bits 1-2 = 0x02
    // byte 1: distReference=0 shifted into bits 0-2 = 0x00
    const payload = new Uint8Array([0x02, 0x00]);

    // Frame: [frameType|status] [command] [payloadLen] [payload...] [crc8]
    const frame = new Uint8Array(3 + payload.length + 1);
    frame[0] = 0xc0; // frameType=3 (request) << 6
    frame[1] = 0x50; // command: control
    frame[2] = payload.length;
    frame.set(payload, 3);
    frame[frame.length - 1] = crc8(frame.subarray(0, frame.length - 1));

    // Wrap in BLE fragment: [seqHeader] [frame]
    const seqHeader = ((this.txSeqNo & 0x0f) << 4) | 0x00; // fragIndex=0 (single fragment)
    this.txSeqNo = (this.txSeqNo + 1) % 15;

    const packet = new Uint8Array(1 + frame.length);
    packet[0] = seqHeader;
    packet.set(frame, 1);

    return packet;
  }
}

// ========================================
// Driver registry
// ========================================

const DRIVERS: LaserDriver[] = [new LeicaDistoDriver(), new BoschGLMDriver()];

/** Name prefixes used for BLE scanning (devices may not advertise service UUIDs) */
const SCAN_NAME_PREFIXES = ["GLM", "DISTO", "Bosch", "Leica"];

/**
 * Auto-detect driver by device name.
 * Falls back to Leica driver as default (most common protocol).
 */
export function detectDriver(deviceName: string): LaserDriver {
  const name = deviceName.toLowerCase();
  if (name.includes("disto") || name.includes("leica")) {
    return DRIVERS[0];
  }
  if (name.includes("glm") || name.includes("bosch")) {
    return DRIVERS[1];
  }
  return DRIVERS[0];
}

/**
 * Try to detect driver by checking which service is available on the GATT server.
 * Used when device name is empty or doesn't match known patterns.
 */
export async function detectDriverByService(server: BluetoothRemoteGATTServer): Promise<LaserDriver | null> {
  for (const driver of DRIVERS) {
    try {
      await server.getPrimaryService(driver.serviceUUID);
      return driver;
    } catch {
      // Service not found, try next
    }
  }
  return null;
}

export function getAllServiceUUIDs(): string[] {
  return DRIVERS.map((d) => d.serviceUUID);
}

/**
 * Build requestDevice options with multiple filter strategies.
 * Uses name prefixes + service UUIDs to maximize discovery.
 */
export function getRequestDeviceOptions(): RequestDeviceOptions {
  const allServices = getAllServiceUUIDs();

  // Multiple filter strategies (OR logic between filters):
  // 1. Filter by known service UUIDs (if device advertises them)
  // 2. Filter by known name prefixes (if device advertises a name)
  const filters: BluetoothLEScanFilter[] = [
    ...allServices.map((uuid) => ({ services: [uuid] })),
    ...SCAN_NAME_PREFIXES.map((prefix) => ({ namePrefix: prefix })),
  ];

  return {
    filters,
    optionalServices: allServices,
  };
}
