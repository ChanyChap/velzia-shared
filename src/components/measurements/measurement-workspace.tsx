"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Eye, Sparkles, Check, Pencil, X, AlertTriangle, Wand2, Ruler, Loader2, MessageSquarePlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import type { MeasurementSession, MeasurementPoint, MeasurementComment, MeasurementStatus } from "@/lib/types";
import { useBluetoothLaser } from "@/hooks/use-bluetooth-laser";
import { PhotoAnnotationCanvas } from "./photo-annotation-canvas";
import { PhotoCaptureButton } from "./photo-capture-button";
import { DimensionEditorSheet } from "./dimension-editor-sheet";
import { CommentEditorSheet } from "./comment-editor-sheet";
import { BluetoothManager } from "./bluetooth-manager";
import { MeasurementSummary } from "./measurement-summary";
import { MeasurementReportPDF } from "./measurement-report-pdf";
import { cn } from "@/lib/utils";
import { CheckCircle } from "lucide-react";

const STATUS_CONFIG: Record<MeasurementStatus, { label: string; color: string }> = {
  borrador: { label: "Borrador", color: "bg-gray-100 text-gray-700" },
  completado: { label: "Completado", color: "bg-blue-100 text-blue-700" },
  en_revision: { label: "En revisión", color: "bg-yellow-100 text-yellow-700" },
  aprobado: { label: "Aprobado", color: "bg-green-100 text-green-700" },
  rechazado: { label: "Rechazado", color: "bg-red-100 text-red-700" },
};

const DEFAULT_COTAS = [
  { label: "Ancho arriba", wall_position: "top", x1: 0.1, y1: 0.08, x2: 0.9, y2: 0.08 },
  { label: "Ancho abajo", wall_position: "bottom", x1: 0.1, y1: 0.92, x2: 0.9, y2: 0.92 },
  { label: "Alto 1", wall_position: "left", x1: 0.05, y1: 0.1, x2: 0.05, y2: 0.9 },
  { label: "Alto 2", wall_position: "right", x1: 0.95, y1: 0.1, x2: 0.95, y2: 0.9 },
  { label: "Profundidad", wall_position: "depth", x1: 0.45, y1: 0.45, x2: 0.55, y2: 0.55 },
] as const;

interface MeasurementWorkspaceProps {
  session: MeasurementSession;
  onSessionUpdate: () => void;
}

export function MeasurementWorkspace({ session, onSessionUpdate }: MeasurementWorkspaceProps) {
  const router = useRouter();
  const bt = useBluetoothLaser();
  const { toast } = useToast();

  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [selectedPoint, setSelectedPoint] = useState<MeasurementPoint | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedComment, setSelectedComment] = useState<MeasurementComment | null>(null);
  const [commentEditorOpen, setCommentEditorOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [pendingBack, setPendingBack] = useState(false);
  const [missingCotas, setMissingCotas] = useState<MeasurementPoint[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [markingMeasured, setMarkingMeasured] = useState(false);
  const [phaseMeasuredDone, setPhaseMeasuredDone] = useState(false);
  const laserBufferRef = useRef("");

  const photos = session.photos || [];
  const activePhoto = photos[activePhotoIndex] || null;
  const activePoints = activePhoto?.points || [];
  const activeComments = activePhoto?.comments || [];
  const statusConf = STATUS_CONFIG[session.status];

  // All points across all photos
  const allPoints = photos.flatMap((p) => p.points || []);

  // On mount: set started_at (if not set) + request geolocation
  useEffect(() => {
    const updates: Record<string, any> = {};

    if (!session.started_at) {
      updates.started_at = new Date().toISOString();
    }

    // Request geolocation
    if (!session.latitude && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          fetch(`/api/measurements/${session.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }),
          });
        },
        () => {} // silently ignore denied permission
      );
    }

    if (Object.keys(updates).length > 0) {
      fetch(`/api/measurements/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createDefaultCotas(photoId: string) {
    const promises = DEFAULT_COTAS.map((cota) =>
      fetch(`/api/measurements/${session.id}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photo_id: photoId,
          label: cota.label,
          wall_position: cota.wall_position,
          point_type: "linear",
          origin: "manual",
          value_source: "manual",
          x1: cota.x1,
          y1: cota.y1,
          x2: cota.x2,
          y2: cota.y2,
        }),
      })
    );
    await Promise.all(promises);
  }

  async function handleBack() {
    const missing = allPoints.filter((p) => p.value_mm == null || p.value_mm === 0);
    if (missing.length > 0) {
      setMissingCotas(missing);
      setPendingBack(true);
    } else {
      // All cotas filled — register end time and leave
      await fetch(`/api/measurements/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ended_at: new Date().toISOString() }),
      });
      router.push("/mediciones");
    }
  }

  async function handleForceBack() {
    setPendingBack(false);
    // Register end time + flag missing cotas
    await fetch(`/api/measurements/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ended_at: new Date().toISOString(),
        exited_with_missing_cotas: true,
      }),
    });
    router.push("/mediciones");
  }

  function handleGoToMissing(point: MeasurementPoint) {
    // Find which photo this point belongs to
    const photoIdx = photos.findIndex((p) => p.points?.some((pt) => pt.id === point.id));
    if (photoIdx >= 0) setActivePhotoIndex(photoIdx);
    setSelectedPoint(point);
    setEditorOpen(true);
    setPendingBack(false);
  }

  const handlePhotoUploaded = useCallback(async (photoData: any) => {
    const photoId = photoData?.id;
    if (photoId) {
      await createDefaultCotas(photoId);
    }
    onSessionUpdate();
    setActivePhotoIndex(photos.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSessionUpdate, photos.length, session.id]);

  const handlePointSelect = useCallback((point: MeasurementPoint) => {
    setSelectedPoint(point);
    setEditorOpen(true);
  }, []);

  const handlePointHighlight = useCallback((point: MeasurementPoint) => {
    setSelectedPoint(point);
  }, []);

  const handlePointDragEnd = useCallback(async (pointId: string, coords: { x1: number; y1: number; x2: number; y2: number }) => {
    const res = await fetch(`/api/measurements/${session.id}/points/${pointId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(coords),
    });
    if (res.ok) {
      onSessionUpdate();
    }
  }, [session.id, onSessionUpdate]);

  // Auto-save BT measurement when point is selected but editor is NOT open (laser listening mode)
  useEffect(() => {
    if (bt.lastMeasurement && selectedPoint && !editorOpen) {
      handleSavePoint(selectedPoint.id, {
        value_mm: bt.lastMeasurement.value_mm,
        value_source: "bluetooth",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bt.lastMeasurement]);

  // Keyboard listener for laser reader emulating keyboard input
  // Laser readers type digits fast and finish with Enter
  useEffect(() => {
    if (!selectedPoint || editorOpen) {
      laserBufferRef.current = "";
      return;
    }

    let bufferTimeout: ReturnType<typeof setTimeout>;

    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Enter") {
        const raw = laserBufferRef.current.trim();
        if (raw.length > 0) {
          const numVal = parseFloat(raw.replace(",", "."));
          if (!isNaN(numVal) && selectedPoint) {
            handleSavePoint(selectedPoint.id, {
              value_mm: numVal,
              value_source: "bluetooth",
            });
            toast({ title: `${selectedPoint.label}: ${numVal} mm`, description: "Lectura automática del láser" });
          }
        }
        laserBufferRef.current = "";
        return;
      }

      // Accumulate digits, dots, commas, minus
      if (/^[\d.,\-]$/.test(e.key)) {
        laserBufferRef.current += e.key;
        // Auto-clear buffer if no more input within 2s (safety)
        clearTimeout(bufferTimeout);
        bufferTimeout = setTimeout(() => {
          laserBufferRef.current = "";
        }, 2000);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(bufferTimeout);
      laserBufferRef.current = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPoint?.id, editorOpen]);

  async function handleAddPoint() {
    if (!activePhoto) return;
    const res = await fetch(`/api/measurements/${session.id}/points`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photo_id: activePhoto.id,
        label: `Cota ${allPoints.length + 1}`,
        x1: 0.15,
        y1: 0.5,
        x2: 0.85,
        y2: 0.5,
      }),
    });
    if (res.ok) {
      onSessionUpdate();
    }
  }

  async function handleDetectCotas() {
    if (!activePhoto) return;
    setDetecting(true);
    setDetectError(null);
    try {
      const res = await fetch(`/api/measurements/${session.id}/detect-cotas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_id: activePhoto.id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.detected > 0) {
          if (data.suggested_name) {
            setSuggestedName(data.suggested_name);
            setNameInput(data.suggested_name);
          }
          onSessionUpdate();
        } else {
          setDetectError(data.error || "No se pudieron detectar las cotas en esta foto");
        }
      } else {
        const errData = await res.json().catch(() => null);
        setDetectError(errData?.error || `Error ${res.status}`);
      }
    } catch {
      setDetectError("Error de conexion");
    } finally {
      setDetecting(false);
    }
  }

  async function handleSavePoint(pointId: string, updates: Partial<MeasurementPoint>) {
    await fetch(`/api/measurements/${session.id}/points/${pointId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    onSessionUpdate();
  }

  async function handleDeletePoint(pointId: string) {
    await fetch(`/api/measurements/${session.id}/points/${pointId}`, {
      method: "DELETE",
    });
    onSessionUpdate();
  }

  const handleCommentSelect = useCallback((comment: MeasurementComment) => {
    setSelectedComment(comment);
    setCommentEditorOpen(true);
  }, []);

  const handleCommentDragEnd = useCallback(async (commentId: string, coords: { x: number; y: number }) => {
    const res = await fetch(`/api/measurements/${session.id}/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(coords),
    });
    if (res.ok) onSessionUpdate();
  }, [session.id, onSessionUpdate]);

  async function handleAddComment() {
    if (!activePhoto) return;
    const res = await fetch(`/api/measurements/${session.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photo_id: activePhoto.id,
        text: "",
        x: 0.5,
        y: 0.3,
      }),
    });
    if (res.ok) {
      const comment = await res.json();
      onSessionUpdate();
      setSelectedComment(comment);
      setCommentEditorOpen(true);
    }
  }

  async function handleSaveComment(commentId: string, updates: Partial<MeasurementComment>) {
    await fetch(`/api/measurements/${session.id}/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    onSessionUpdate();
  }

  async function handleDeleteComment(commentId: string) {
    await fetch(`/api/measurements/${session.id}/comments/${commentId}`, {
      method: "DELETE",
    });
    onSessionUpdate();
  }

  async function handleStatusChange(newStatus: MeasurementStatus) {
    await fetch(`/api/measurements/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    onSessionUpdate();
  }

  async function handleAcceptName() {
    const name = nameInput.trim();
    if (!name) return;
    await fetch(`/api/measurements/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_name: name }),
    });
    onSessionUpdate();
    setSuggestedName(null);
    setEditingName(false);
  }

  async function handleMarkMeasured() {
    if (!session.subproject_id) {
      toast({ title: "Esta medicion no tiene subproyecto asociado", variant: "destructive" });
      return;
    }
    setMarkingMeasured(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id, full_name")
        .eq("id", user.id)
        .single();
      if (!profile?.tenant_id) throw new Error("Sin tenant");

      // Find the medicion_definitiva phase for this subproject
      const { data: phase } = await supabase
        .from("fab_wbs_phases")
        .select("id, name, progress_percent")
        .eq("subproject_id", session.subproject_id)
        .eq("phase_type", "medicion_definitiva")
        .limit(1)
        .maybeSingle();

      if (!phase) {
        toast({ title: "No se encontro la fase de medicion definitiva para este subproyecto", variant: "destructive" });
        return;
      }

      if (phase.progress_percent >= 100) {
        toast({ title: "La fase de medicion ya estaba completada" });
        setPhaseMeasuredDone(true);
        return;
      }

      // Mark phase as completed
      const now = new Date().toISOString();
      await supabase
        .from("fab_wbs_phases")
        .update({
          progress_percent: 100,
          actual_end: now.split("T")[0],
        })
        .eq("id", phase.id);

      // Also mark the measurement session as completed
      await fetch(`/api/measurements/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completado", ended_at: now }),
      });

      // Register in audit log
      await supabase.from("fab_audit_log").insert({
        tenant_id: profile.tenant_id,
        entity_type: "wbs_phase",
        entity_id: phase.id,
        action: "manual_measurement_completion",
        field_changed: "progress_percent",
        old_value: String(phase.progress_percent),
        new_value: "100",
        performed_by: user.id,
        metadata: {
          label: "Medicion marcada como completada manualmente",
          user_name: profile.full_name,
          measurement_session_id: session.id,
          measurement_session_number: session.session_number,
          subproject_id: session.subproject_id,
          accepted_responsibility: true,
          timestamp: now,
        },
      });

      toast({ title: "Medicion marcada como completada" });
      setPhaseMeasuredDone(true);
      onSessionUpdate();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setMarkingMeasured(false);
    }
  }

  if (showSummary) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setShowSummary(false)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver al editor
          </Button>
          <div className="flex gap-2">
            <MeasurementReportPDF sessionId={session.id} />
            {session.status === "borrador" && (
              <Button size="sm" onClick={() => handleStatusChange("completado")}>
                <CheckCircle className="h-4 w-4 mr-1" />
                Completar
              </Button>
            )}
          </div>
        </div>
        <MeasurementSummary session={session} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-sm">{session.session_number}</span>
          <Badge className={cn("text-xs", statusConf.color)}>{statusConf.label}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {session.subproject_id && !phaseMeasuredDone && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50" disabled={markingMeasured}>
                  {markingMeasured ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Ruler className="h-4 w-4 mr-1" />
                  )}
                  Ya lo he medido
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Declaracion de responsabilidad
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-3 text-sm">
                    <span className="block">
                      Al confirmar, declaras que <strong>has realizado personalmente las mediciones</strong> de este espacio y que los valores registrados son correctos y completos.
                    </span>
                    <span className="block font-medium text-amber-700">
                      Te haces el unico responsable de la veracidad y exactitud de las medidas. Cualquier error en las mediciones podra afectar a la fabricacion y al montaje.
                    </span>
                    <span className="block text-muted-foreground">
                      Esta accion quedara registrada en el diario de actividad con tu nombre, fecha y hora.
                    </span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-green-600 hover:bg-green-700"
                    onClick={handleMarkMeasured}
                  >
                    Confirmo, he medido correctamente
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {phaseMeasuredDone && (
            <Badge className="bg-green-100 text-green-700 text-xs">
              <CheckCircle className="h-3 w-3 mr-1" />
              Medido
            </Badge>
          )}
          <BluetoothManager
            status={bt.status}
            deviceName={bt.deviceName}
            isSupported={bt.isSupported}
            error={bt.error}
            onConnect={bt.connect}
            onDisconnect={bt.disconnect}
          />
        </div>
      </div>

      {/* Warning: missing cotas */}
      {pendingBack && missingCotas.length > 0 && (
        <div className="mx-1 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
          <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
            <AlertTriangle className="h-4 w-4" />
            {missingCotas.length === 1
              ? "Hay 1 cota sin medida"
              : `Hay ${missingCotas.length} cotas sin medida`}
          </div>
          <div className="flex flex-wrap gap-1">
            {missingCotas.map((p) => (
              <button
                key={p.id}
                onClick={() => handleGoToMissing(p)}
                className="text-xs px-2 py-1 bg-amber-100 hover:bg-amber-200 rounded text-amber-800 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => setPendingBack(false)}>
              Rellenar cotas
            </Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={handleForceBack}>
              Salir igualmente
            </Button>
          </div>
        </div>
      )}

      {/* Photo carousel */}
      <div className={cn(
        "flex gap-2 overflow-x-auto px-1 pb-1 transition-[opacity,max-height] duration-150",
        isDragging && "opacity-0 max-h-0 overflow-hidden pointer-events-none !pb-0"
      )}>
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            onClick={() => setActivePhotoIndex(i)}
            className={cn(
              "shrink-0 w-20 h-20 rounded overflow-hidden border-2",
              i === activePhotoIndex ? "border-primary" : "border-transparent"
            )}
          >
            <img src={photo.url} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
        <PhotoCaptureButton
          sessionId={session.id}
          onPhotoUploaded={handlePhotoUploaded}
        />
      </div>

      {/* AI suggested name badge */}
      {suggestedName && (
        <div className={cn(
          "flex items-center gap-2 mx-1 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm transition-opacity duration-150",
          isDragging && "opacity-0 pointer-events-none"
        )}>
          <Sparkles className="h-4 w-4 text-blue-500 shrink-0" />
          {editingName ? (
            <Input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAcceptName(); }}
              autoFocus
              className="h-7 text-sm flex-1"
            />
          ) : (
            <span className="flex-1">
              IA sugiere: <strong>{suggestedName}</strong>
            </span>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleAcceptName} title="Aceptar">
            <Check className="h-4 w-4 text-green-600" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingName(true); }} title="Editar">
            <Pencil className="h-4 w-4 text-blue-600" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setSuggestedName(null); setEditingName(false); }} title="Cerrar">
            <X className="h-4 w-4 text-gray-500" />
          </Button>
        </div>
      )}

      {/* Canvas */}
      {activePhoto ? (
        <PhotoAnnotationCanvas
          photo={activePhoto}
          points={activePoints}
          comments={activeComments}
          selectedPointId={selectedPoint?.id}
          selectedCommentId={selectedComment?.id}
          onPointSelect={handlePointSelect}
          onPointHighlight={handlePointHighlight}
          onPointDragEnd={handlePointDragEnd}
          onCommentSelect={handleCommentSelect}
          onCommentDragEnd={handleCommentDragEnd}
          onDragActiveChange={setIsDragging}
          className="flex-1 min-h-[300px] max-h-[60vh]"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground bg-gray-50 rounded-lg min-h-[300px]">
          <div className="text-center">
            <p className="mb-3">Haz una foto para empezar</p>
            <PhotoCaptureButton
              sessionId={session.id}
              onPhotoUploaded={handlePhotoUploaded}
            />
          </div>
        </div>
      )}

      {/* Laser listening mode indicator */}
      {selectedPoint && !editorOpen && !isDragging && (
        <div className="mx-1 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between text-sm animate-pulse">
          <div className="flex items-center gap-2 text-blue-700">
            <Ruler className="h-4 w-4" />
            <span>
              <strong>{selectedPoint.label}</strong> — Esperando medida del láser…
            </span>
          </div>
          <span className="text-xs text-blue-500">Doble tap para editar manual</span>
        </div>
      )}

      {/* Detect error */}
      {detectError && (
        <div className="mx-1 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive flex items-center justify-between">
          <span>{detectError}</span>
          <button onClick={() => setDetectError(null)} className="ml-2 text-destructive/60 hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Bottom toolbar */}
      {activePhoto && (
        <div className={cn(
          "flex items-center justify-between gap-2 px-1 transition-opacity duration-150",
          isDragging && "opacity-0 pointer-events-none"
        )}>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleAddPoint}>
              <Plus className="h-4 w-4 mr-1" />
              Cota
            </Button>
            <Button size="sm" variant="outline" onClick={handleAddComment}>
              <MessageSquarePlus className="h-4 w-4 mr-1" />
              Nota
            </Button>
            <Button size="sm" variant="outline" onClick={handleDetectCotas} disabled={detecting}>
              <Wand2 className="h-4 w-4 mr-1" />
              {detecting ? "Adivinando..." : "Adivinar cotas"}
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowSummary(true)}>
            <Eye className="h-4 w-4 mr-1" />
            Resumen
          </Button>
        </div>
      )}

      {/* Dimension editor sheet */}
      <DimensionEditorSheet
        point={selectedPoint}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={handleSavePoint}
        onDelete={handleDeletePoint}
        bluetoothConnected={bt.status === "connected"}
        lastBluetoothValue={bt.lastMeasurement?.value_mm ?? null}
      />

      {/* Comment editor sheet */}
      <CommentEditorSheet
        comment={selectedComment}
        open={commentEditorOpen}
        onOpenChange={setCommentEditorOpen}
        onSave={handleSaveComment}
        onDelete={handleDeleteComment}
      />
    </div>
  );
}
