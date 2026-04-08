/**
 * audio-chunker.ts
 *
 * Divide un archivo de audio en chunks WAV (16 kHz mono) compatibles
 * con Whisper API (< 24 MB cada uno). Usa Web Audio API nativa — cero deps.
 *
 * Si el blob ya cabe en un solo request (< 24 MB), lo devuelve tal cual
 * sin procesamiento adicional (fast path).
 */

/** Tamano maximo seguro para Whisper (dejamos margen sobre 25 MB) */
const MAX_CHUNK_BYTES = 20 * 1024 * 1024; // 20 MB

/** Sample rate de salida — Whisper internamente trabaja a 16 kHz */
const TARGET_SAMPLE_RATE = 16_000;

/** Bytes por sample (Int16) */
const BYTES_PER_SAMPLE = 2;

export interface ChunkResult {
  /** Blobs WAV listos para enviar a Whisper */
  chunks: Blob[];
  /** Duracion acumulada al inicio de cada chunk (para ajustar timestamps) */
  offsets: number[];
  /** Duracion total del audio en segundos */
  totalDuration: number;
}

/**
 * Divide un audio Blob en chunks WAV de ~10 min (< 20 MB a 16 kHz mono).
 *
 * @param blob - Audio blob (webm, mp3, wav, m4a, etc.)
 * @returns Chunks WAV + offsets de tiempo para ajustar timestamps
 */
export async function splitAudioForWhisper(blob: Blob): Promise<ChunkResult> {
  // Siempre convertimos a WAV para garantizar compatibilidad con Whisper API.
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    await audioCtx.close();
  }

  // Downsample a 16 kHz mono usando OfflineAudioContext
  const monoBuffer = await downmixToMono16k(audioBuffer);

  const totalSamples = monoBuffer.length;
  const totalDuration = totalSamples / TARGET_SAMPLE_RATE;

  // Calcular tamano de chunk (en samples)
  const maxSamplesPerChunk = Math.floor(MAX_CHUNK_BYTES / BYTES_PER_SAMPLE);

  const pcmData = monoBuffer.getChannelData(0);
  const chunks: Blob[] = [];
  const offsets: number[] = [];

  let offset = 0;
  while (offset < totalSamples) {
    const end = Math.min(offset + maxSamplesPerChunk, totalSamples);
    const chunkPcm = pcmData.slice(offset, end);

    const wavBlob = encodeWAV(chunkPcm, TARGET_SAMPLE_RATE);
    chunks.push(wavBlob);
    offsets.push(offset / TARGET_SAMPLE_RATE);

    offset = end;
  }

  return { chunks, offsets, totalDuration };
}

// Helpers internos

/** Downmix a 16 kHz mono con OfflineAudioContext */
async function downmixToMono16k(buffer: AudioBuffer): Promise<AudioBuffer> {
  if (
    buffer.sampleRate === TARGET_SAMPLE_RATE &&
    buffer.numberOfChannels === 1
  ) {
    return buffer;
  }

  const outputLength = Math.ceil(buffer.duration * TARGET_SAMPLE_RATE);
  const offlineCtx = new OfflineAudioContext(1, outputLength, TARGET_SAMPLE_RATE);

  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  return offlineCtx.startRendering();
}

/** Codifica Float32 PCM -> WAV Blob (Int16 LE) — JS puro, 0 deps */
function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const numSamples = samples.length;
  const dataSize = numSamples * BYTES_PER_SAMPLE;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true);
  view.setUint16(32, BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // PCM samples (Float32 -> Int16)
  let byteOffset = headerSize;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(byteOffset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    byteOffset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
