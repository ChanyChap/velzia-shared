"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Video, Mic, X, Upload, Loader2 } from "lucide-react";
import type { FieldTicketMedia } from "@/lib/types";

interface MediaUploadProps {
  media: FieldTicketMedia[];
  onUploaded: (item: FieldTicketMedia) => void;
  onRemove: (index: number) => void;
  ticketId?: string | null;
  uploadEndpoint?: string;
  /** Which capture buttons to show. Defaults to all four. */
  allowedTypes?: ("photo" | "video" | "audio" | "gallery")[];
  /** Restrict gallery file picker accept attribute (e.g. "image/*") */
  galleryAccept?: string;
}

export function MediaUpload({ media, onUploaded, onRemove, ticketId, uploadEndpoint, allowedTypes, galleryAccept }: MediaUploadProps) {
  const allowed = allowedTypes || ["photo", "video", "audio", "gallery"];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (ticketId && uploadEndpoint) {
        setUploading(true);
        try {
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch(uploadEndpoint, { method: "POST", body: formData });
          if (res.ok) {
            const data = await res.json();
            onUploaded(data);
          }
        } finally {
          setUploading(false);
        }
      } else {
        const url = URL.createObjectURL(file);
        const type = file.type.startsWith("video/")
          ? "video"
          : file.type.startsWith("audio/")
            ? "audio"
            : "image";
        onUploaded({
          url,
          storage_path: "",
          type,
          filename: file.name,
        });
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (videoInputRef.current) videoInputRef.current.value = "";
    if (audioInputRef.current) audioInputRef.current.value = "";
  }

  function handleTapRemove(idx: number) {
    if (confirmRemove === idx) {
      onRemove(idx);
      setConfirmRemove(null);
    } else {
      setConfirmRemove(idx);
      setTimeout(() => setConfirmRemove(null), 3000);
    }
  }

  return (
    <div className="space-y-3">
      {/* Preview grid */}
      {media.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {media.map((m, idx) => (
            <div
              key={idx}
              className="relative aspect-square rounded-xl overflow-hidden border-2 border-muted"
              onClick={() => handleTapRemove(idx)}
            >
              {m.type === "image" ? (
                <img src={m.url} alt={m.filename} className="w-full h-full object-cover" />
              ) : m.type === "video" ? (
                <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center gap-1">
                  <Video className="h-8 w-8 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground truncate max-w-[80%] px-1">
                    {m.filename}
                  </span>
                </div>
              ) : (
                <div className="w-full h-full bg-blue-50 flex flex-col items-center justify-center gap-1">
                  <Mic className="h-8 w-8 text-blue-400" />
                  <span className="text-[10px] text-muted-foreground truncate max-w-[80%] px-1">
                    {m.filename}
                  </span>
                </div>
              )}
              {/* Tap-to-remove overlay */}
              <div
                className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ${
                  confirmRemove === idx
                    ? "bg-red-500/80 opacity-100"
                    : "bg-black/0 opacity-0"
                }`}
              >
                {confirmRemove === idx && (
                  <div className="text-white text-center">
                    <X className="h-6 w-6 mx-auto" />
                    <span className="text-xs font-medium">Toca para eliminar</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className={`grid gap-2 ${allowed.length <= 2 ? "grid-cols-2" : "grid-cols-2"}`}>
        {allowed.includes("photo") && (
          <Button
            type="button"
            variant="outline"
            className="h-14 text-sm gap-2 rounded-xl"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Camera className="h-5 w-5" />
            )}
            Foto
          </Button>
        )}
        {allowed.includes("video") && (
          <Button
            type="button"
            variant="outline"
            className="h-14 text-sm gap-2 rounded-xl"
            onClick={() => videoInputRef.current?.click()}
            disabled={uploading}
          >
            <Video className="h-5 w-5" />
            Vídeo
          </Button>
        )}
        {allowed.includes("audio") && (
          <Button
            type="button"
            variant="outline"
            className="h-14 text-sm gap-2 rounded-xl"
            onClick={() => audioInputRef.current?.click()}
            disabled={uploading}
          >
            <Mic className="h-5 w-5" />
            Audio
          </Button>
        )}
        {allowed.includes("gallery") && (
          <Button
            type="button"
            variant="outline"
            className="h-14 text-sm gap-2 rounded-xl"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="h-5 w-5" />
            Galería
          </Button>
        )}
      </div>

      {media.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Toca un archivo para eliminarlo · {media.length} archivo{media.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Camera photo input */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      {/* Camera video input */}
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      {/* Audio input */}
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        capture
        className="hidden"
        onChange={handleFileChange}
      />
      {/* Gallery input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={galleryAccept || "image/*,video/*,audio/*"}
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
