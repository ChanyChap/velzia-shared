"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, ImagePlus } from "lucide-react";
import { compressImage } from "@/lib/image-compression";

interface PhotoCaptureButtonProps {
  sessionId: string;
  onPhotoUploaded: (photo: any) => void;
  disabled?: boolean;
}

export function PhotoCaptureButton({ sessionId, onPhotoUploaded, disabled }: PhotoCaptureButtonProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const rawFile of Array.from(files)) {
        const file = await compressImage(rawFile);
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/measurements/${sessionId}/photos`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const photo = await res.json();
          onPhotoUploaded(photo);
        }
      }
    } finally {
      setUploading(false);
      // Reset inputs
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex gap-2">
      {/* Camera capture (mobile) */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => cameraRef.current?.click()}
        disabled={disabled || uploading}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Camera className="h-4 w-4 mr-1" />
        )}
        Foto
      </Button>

      {/* File picker (gallery/desktop) */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFile}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={disabled || uploading}
      >
        <ImagePlus className="h-4 w-4 mr-1" />
        Galeria
      </Button>
    </div>
  );
}
