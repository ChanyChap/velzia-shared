"use client";

import { AlertTriangle, X, ArrowRight } from "lucide-react";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";
import type { DocumentDetection } from "./types";

interface ChatDocumentDetectionAlertProps {
  detection: DocumentDetection;
  projectId: string;
  onDismiss: () => void;
}

export function ChatDocumentDetectionAlert({
  detection,
  projectId,
  onDismiss,
}: ChatDocumentDetectionAlertProps) {
  const router = useRouter();

  return (
    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-amber-800">
          Este archivo parece ser un <strong>{detection.label}</strong>. Subelo
          en <strong>{detection.path}</strong> para que quede archivado
          correctamente.
        </p>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-amber-700 hover:text-amber-900 mt-1"
          onClick={() => {
            router.push(`/proyectos/${projectId}/${detection.path}`);
            onDismiss();
          }}
        >
          Ir a {detection.path}
          <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 text-amber-600 hover:text-amber-800 shrink-0"
        onClick={onDismiss}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
