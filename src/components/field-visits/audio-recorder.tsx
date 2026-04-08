"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Sparkles, Loader2, RotateCcw, Square, Trash2 } from "lucide-react";
import { splitAudioForWhisper } from "@/lib/audio-chunker";

interface AudioRecorderProps {
  transcript: string;
  onTranscriptChange: (transcript: string) => void;
  onProcessWithAI: (transcript: string) => Promise<void>;
  processing?: boolean;
}

export function AudioRecorder({ transcript, onTranscriptChange, onProcessWithAI, processing }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const [duration, setDuration] = useState(0);
  const [interimText, setInterimText] = useState("");

  // MediaRecorder (actual audio capture)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPlaybackUrl, setAudioPlaybackUrl] = useState<string | null>(null);

  // Web Speech API (real-time preview)
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Whisper pipeline
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState<{ done: number; total: number } | null>(null);

  const MAX_RECORDING_SECS = 4 * 60 * 60; // 4 hours

  useEffect(() => {
    return () => {
      if (audioPlaybackUrl && audioPlaybackUrl.startsWith("blob:")) {
        URL.revokeObjectURL(audioPlaybackUrl);
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatDuration = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  };

  const startRecording = useCallback(async () => {
    // Request microphone
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert("No se pudo acceder al microfono. Verifica los permisos del navegador.");
      return;
    }
    mediaStreamRef.current = stream;

    // Determine best audio format
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/webm";

    // Start MediaRecorder
    audioChunksRef.current = [];
    const mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      setAudioBlob(blob);
      const url = URL.createObjectURL(blob);
      setAudioPlaybackUrl(url);
    };
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start(1000); // 1s chunks

    // Duration timer
    setDuration(0);
    timerRef.current = setInterval(() => {
      setDuration((prev) => {
        if (prev >= MAX_RECORDING_SECS - 1) {
          stopRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);

    // Web Speech API for real-time preview (best-effort)
    const SR = typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (SR) {
      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "es-ES";

      transcriptRef.current = transcript;

      recognition.onresult = (event: any) => {
        let final = "";
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript + " ";
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        if (final) {
          transcriptRef.current += final;
          onTranscriptChange(transcriptRef.current);
        }
        setInterimText(interim);
      };

      recognition.onerror = (event: any) => {
        if (event.error !== "no-speech") {
          console.error("Speech recognition error:", event.error);
        }
      };

      recognition.onend = () => {
        if (isRecordingRef.current && recognitionRef.current) {
          try { recognitionRef.current.start(); } catch {}
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    }

    isRecordingRef.current = true;
    setIsRecording(true);
    setAudioBlob(null);
    if (audioPlaybackUrl && audioPlaybackUrl.startsWith("blob:")) {
      URL.revokeObjectURL(audioPlaybackUrl);
    }
    setAudioPlaybackUrl(null);
  }, [transcript, onTranscriptChange]);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;

    // Stop Web Speech API
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    // Stop microphone stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setIsRecording(false);
    setInterimText("");
  }, []);

  const discardRecording = useCallback(() => {
    if (audioPlaybackUrl && audioPlaybackUrl.startsWith("blob:")) {
      URL.revokeObjectURL(audioPlaybackUrl);
    }
    setAudioBlob(null);
    setAudioPlaybackUrl(null);
    setDuration(0);
    onTranscriptChange("");
    transcriptRef.current = "";
  }, [audioPlaybackUrl, onTranscriptChange]);

  // Pipeline: Chunk audio -> Whisper (parallel) -> Claude AI
  const handleTranscribePipeline = useCallback(async () => {
    if (!audioBlob) return;

    setTranscribing(true);
    setTranscribeProgress(null);
    try {
      // Step 1: Split audio into chunks
      const { chunks, offsets } = await splitAudioForWhisper(audioBlob);
      const totalChunks = chunks.length;
      setTranscribeProgress({ done: 0, total: totalChunks });

      // Step 2: Transcribe chunks in parallel (max 5 concurrent)
      const MAX_CONCURRENT = 5;
      const results: { text: string; segments: any[]; duration: number }[] = new Array(totalChunks);
      let completed = 0;

      for (let batch = 0; batch < totalChunks; batch += MAX_CONCURRENT) {
        const batchChunks = chunks.slice(batch, batch + MAX_CONCURRENT);
        const batchPromises = batchChunks.map(async (chunk, batchIdx) => {
          const idx = batch + batchIdx;
          const form = new FormData();
          form.append("audio", chunk, `chunk_${idx}.wav`);

          const res = await fetch("/api/ai/transcribe-audio", {
            method: "POST",
            body: form,
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Error transcribiendo parte ${idx + 1}`);
          }

          const data = await res.json();
          results[idx] = {
            text: data.text || "",
            segments: (data.segments || []).map((seg: any) => ({
              ...seg,
              start: (seg.start || 0) + offsets[idx],
              end: (seg.end || 0) + offsets[idx],
            })),
            duration: data.duration || 0,
          };

          completed++;
          setTranscribeProgress({ done: completed, total: totalChunks });
        });

        await Promise.all(batchPromises);
      }

      // Concatenate transcripts in order
      const whisperText = results.map((r) => r.text).filter(Boolean).join(" ");

      // Replace browser transcript with Whisper transcript (much higher quality)
      onTranscriptChange(whisperText);

      // Step 3: Process with Claude AI
      await onProcessWithAI(whisperText);
    } catch (err: unknown) {
      console.error("[Pipeline] Error:", err);
      alert((err instanceof Error ? err.message : String(err)) || "Error al transcribir el audio");
    } finally {
      setTranscribing(false);
      setTranscribeProgress(null);
    }
  }, [audioBlob, onTranscriptChange, onProcessWithAI]);

  const isBusy = processing || transcribing;

  return (
    <div className="space-y-4">
      {/* Big recording button */}
      <div className="flex flex-col items-center gap-3 py-2">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isBusy}
          className={`relative flex items-center justify-center h-20 w-20 rounded-full transition-all active:scale-95 disabled:opacity-50 ${
            isRecording
              ? "bg-red-500 text-white shadow-lg shadow-red-500/30"
              : "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
          }`}
        >
          {isRecording ? (
            <Square className="h-8 w-8" />
          ) : (
            <Mic className="h-8 w-8" />
          )}
          {isRecording && (
            <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />
          )}
        </button>

        {isRecording ? (
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium text-red-600">
              Grabando · {formatDuration(duration)}
            </span>
          </div>
        ) : audioBlob ? (
          <p className="text-sm text-green-600 font-medium">
            Audio grabado · {formatDuration(duration)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {transcript ? "Toca para seguir grabando" : "Toca para grabar la conversacion"}
          </p>
        )}
      </div>

      {/* Audio playback */}
      {audioPlaybackUrl && !isRecording && (
        <div className="flex items-center gap-2 bg-muted/50 rounded-xl p-3">
          <audio controls src={audioPlaybackUrl} className="flex-1 h-10" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={discardRecording}
            disabled={isBusy}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Real-time transcript preview (from Web Speech API) */}
      {(transcript || interimText) && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">
            {isRecording ? "Preview en tiempo real (se mejorara con Whisper)" : "Transcripcion"}
          </p>
          <Textarea
            placeholder="La transcripcion aparecera aqui..."
            value={transcript + (interimText ? ` ${interimText}` : "")}
            onChange={(e) => onTranscriptChange(e.target.value)}
            rows={6}
            className="text-base leading-relaxed"
            readOnly={isRecording}
          />
        </div>
      )}

      {/* Manual input when no recording */}
      {!audioBlob && !isRecording && !transcript && (
        <Textarea
          placeholder="O escribe la transcripcion manualmente..."
          value={transcript}
          onChange={(e) => onTranscriptChange(e.target.value)}
          rows={4}
          className="text-base leading-relaxed"
        />
      )}

      {/* Progress indicator */}
      {transcribeProgress && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                Transcribiendo con Whisper...
              </p>
              <p className="text-xs text-muted-foreground">
                Parte {transcribeProgress.done} de {transcribeProgress.total}
              </p>
              <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${(transcribeProgress.done / transcribeProgress.total) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {processing && !transcribeProgress && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            <p className="text-sm font-medium">Analizando con IA...</p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Primary action: Whisper pipeline (when audio exists) */}
        {audioBlob && !isRecording && (
          <Button
            onClick={handleTranscribePipeline}
            disabled={isBusy}
            className="h-12 text-sm flex-1"
          >
            {isBusy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {transcribing ? "Transcribiendo..." : processing ? "Procesando..." : "Transcribir y analizar con IA"}
          </Button>
        )}

        {/* Fallback: process manually-typed transcript */}
        {!audioBlob && transcript.trim() && !isRecording && (
          <Button
            onClick={() => onProcessWithAI(transcript)}
            disabled={isBusy}
            className="h-12 text-sm flex-1"
          >
            {processing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {processing ? "Procesando..." : "Procesar con IA"}
          </Button>
        )}

        {transcript && !isRecording && !isBusy && (
          <Button
            variant="outline"
            className="h-12 text-sm"
            onClick={() => {
              onTranscriptChange("");
              transcriptRef.current = "";
            }}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Limpiar texto
          </Button>
        )}
      </div>
    </div>
  );
}
