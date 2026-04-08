"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Ruler } from "lucide-react";

interface SimpleEntity {
  id: string;
  name: string;
  project_number?: string;
  order_number?: string;
  description?: string;
  item_index?: number;
}

interface MeasurementSessionFormProps {
  lockedProjectId?: string;
}

export function MeasurementSessionForm({ lockedProjectId }: MeasurementSessionFormProps) {
  const router = useRouter();
  const [_loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cascade state
  const [projects, setProjects] = useState<SimpleEntity[]>([]);
  const [subprojects, setSubprojects] = useState<SimpleEntity[]>([]);
  const [workOrders, setWorkOrders] = useState<SimpleEntity[]>([]);
  const [orderItems, setOrderItems] = useState<SimpleEntity[]>([]);
  const [projectRooms, setProjectRooms] = useState<{ id: string; name: string }[]>([]);

  // Form state
  const [projectId, setProjectId] = useState(lockedProjectId || "");
  const [subprojectId, setSubprojectId] = useState("");
  const [workOrderId, setWorkOrderId] = useState("");
  const [orderItemId, setOrderItemId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [customRoomMode, setCustomRoomMode] = useState(false);
  const [locationAddress, setLocationAddress] = useState("");
  const [notes, setNotes] = useState("");

  // Locked project name
  const lockedProjectName = lockedProjectId
    ? projects.find((p) => p.id === lockedProjectId)
    : null;

  // Load projects on mount
  useEffect(() => {
    setLoading(true);
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setProjects(list);
        // If locked, ensure projectId is set after projects load
        if (lockedProjectId && !projectId) {
          setProjectId(lockedProjectId);
        }
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load project rooms (estancias) when project changes
  useEffect(() => {
    if (!projectId) {
      setProjectRooms([]);
      setRoomName("");
      setCustomRoomMode(false);
      return;
    }
    setRoomName("");
    setCustomRoomMode(false);
    const supabase = createClient();
    supabase
      .from("fab_project_rooms")
      .select("id, name")
      .eq("project_id", projectId)
      .order("sort_order")
      .then(({ data }) => setProjectRooms(data || []), () => setProjectRooms([]));
  }, [projectId]);

  // Load subprojects when project changes
  useEffect(() => {
    if (!projectId) {
      setSubprojects([]);
      setSubprojectId("");
      return;
    }
    fetch(`/api/subprojects?project_id=${projectId}`)
      .then((r) => r.json())
      .then((data) => setSubprojects(Array.isArray(data) ? data : []))
      .catch(() => setSubprojects([]));
    setSubprojectId("");
    setWorkOrderId("");
    setOrderItemId("");
  }, [projectId]);

  // Load work orders when project changes
  useEffect(() => {
    if (!projectId) {
      setWorkOrders([]);
      setWorkOrderId("");
      return;
    }
    const params = new URLSearchParams({ project_id: projectId });
    if (subprojectId) params.set("subproject_id", subprojectId);
    fetch(`/api/work-orders?${params}`)
      .then((r) => r.json())
      .then((data) => setWorkOrders(Array.isArray(data) ? data : []))
      .catch(() => setWorkOrders([]));
    setWorkOrderId("");
    setOrderItemId("");
  }, [projectId, subprojectId]);

  // Load order items when work order changes
  useEffect(() => {
    if (!workOrderId) {
      setOrderItems([]);
      setOrderItemId("");
      return;
    }
    fetch(`/api/order-items?work_order_id=${workOrderId}`)
      .then((r) => r.json())
      .then((data) => setOrderItems(Array.isArray(data) ? data : []))
      .catch(() => setOrderItems([]));
    setOrderItemId("");
  }, [workOrderId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          subproject_id: subprojectId || null,
          work_order_id: workOrderId || null,
          order_item_id: orderItemId || null,
          room_name: roomName || null,
          location_address: locationAddress || null,
          notes: notes || null,
        }),
      });
      if (res.ok) {
        const session = await res.json();
        router.push(`/mediciones/${session.id}`);
      } else {
        const errData = await res.json().catch(() => null);
        setError(errData?.error || `Error ${res.status}: No se pudo crear la sesión`);
      }
    } catch (err) {
      setError(`Error de red: ${err instanceof Error ? err.message : "No se pudo conectar"}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ruler className="h-5 w-5" />
          Nueva sesión de medición
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project (required) */}
          <div className="space-y-2">
            <Label>Proyecto *</Label>
            {lockedProjectId ? (
              <Input
                value={lockedProjectName ? lockedProjectName.name : "Cargando..."}
                disabled
                className="bg-muted"
              />
            ) : (
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un proyecto" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name || p.project_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Subproject (optional) */}
          {subprojects.length > 0 && (
            <div className="space-y-2">
              <Label>Subproyecto</Label>
              <Select value={subprojectId} onValueChange={setSubprojectId}>
                <SelectTrigger>
                  <SelectValue placeholder="(Opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {subprojects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Work Order (optional) */}
          {workOrders.length > 0 && (
            <div className="space-y-2">
              <Label>Orden de Fabricación</Label>
              <Select value={workOrderId} onValueChange={setWorkOrderId}>
                <SelectTrigger>
                  <SelectValue placeholder="(Opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {workOrders.map((wo) => (
                    <SelectItem key={wo.id} value={wo.id}>
                      {wo.order_number} — {wo.name || wo.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Order Item (optional) */}
          {orderItems.length > 0 && (
            <div className="space-y-2">
              <Label>Componente</Label>
              <Select value={orderItemId} onValueChange={setOrderItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="(Opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {orderItems.map((oi) => (
                    <SelectItem key={oi.id} value={oi.id}>
                      #{oi.item_index} — {oi.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Room & Address */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Habitación / Zona</Label>
              {projectRooms.length > 0 ? (
                <>
                  <Select
                    value={customRoomMode ? "__other__" : roomName}
                    onValueChange={(val) => {
                      if (val === "__other__") {
                        setCustomRoomMode(true);
                        setRoomName("");
                      } else {
                        setCustomRoomMode(false);
                        setRoomName(val);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona estancia" />
                    </SelectTrigger>
                    <SelectContent>
                      {projectRooms.map((room) => (
                        <SelectItem key={room.id} value={room.name}>{room.name}</SelectItem>
                      ))}
                      <SelectItem value="__other__">Otra (escribir)</SelectItem>
                    </SelectContent>
                  </Select>
                  {customRoomMode && (
                    <Input
                      placeholder="Nombre de la zona..."
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      autoFocus
                    />
                  )}
                </>
              ) : (
                <Input
                  placeholder="Ej: Dormitorio principal"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Dirección</Label>
              <Input
                placeholder="Ej: C/ Mayor 15, 2ºA"
                value={locationAddress}
                onChange={(e) => setLocationAddress(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              placeholder="Observaciones adicionales..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Submit */}
          <Button type="submit" className="w-full" disabled={!projectId || submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creando...
              </>
            ) : (
              <>
                <Ruler className="h-4 w-4 mr-2" />
                Comenzar medición
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
