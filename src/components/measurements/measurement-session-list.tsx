"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Ruler, Plus, Search, Calendar, User, MapPin, Trash2 } from "lucide-react";
import type { MeasurementSession, MeasurementStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<MeasurementStatus, { label: string; color: string }> = {
  borrador: { label: "Borrador", color: "bg-gray-100 text-gray-700" },
  completado: { label: "Completado", color: "bg-blue-100 text-blue-700" },
  en_revision: { label: "En revisión", color: "bg-yellow-100 text-yellow-700" },
  aprobado: { label: "Aprobado", color: "bg-green-100 text-green-700" },
  rechazado: { label: "Rechazado", color: "bg-red-100 text-red-700" },
};

interface MeasurementSessionListProps {
  sessions: MeasurementSession[];
  loading?: boolean;
  onDelete?: (id: string) => void;
  currentUserId?: string;
  currentUserRole?: string;
}

const ADMIN_ROLES = ["superadmin", "admin_empresa", "admin_fabrica", "jefe_produccion", "rplace"];

export function MeasurementSessionList({
  sessions,
  loading,
  onDelete,
  currentUserId,
  currentUserRole,
}: MeasurementSessionListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const isAdmin = currentUserRole ? ADMIN_ROLES.includes(currentUserRole) : false;

  const filtered = sessions.filter((s) => {
    const matchesSearch =
      !search ||
      s.session_number.toLowerCase().includes(search.toLowerCase()) ||
      s.room_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.project?.name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, habitación o proyecto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="borrador">Borrador</SelectItem>
            <SelectItem value="completado">Completado</SelectItem>
            <SelectItem value="en_revision">En revisión</SelectItem>
            <SelectItem value="aprobado">Aprobado</SelectItem>
            <SelectItem value="rechazado">Rechazado</SelectItem>
          </SelectContent>
        </Select>
        <Link href="/mediciones/nueva">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nueva medición
          </Button>
        </Link>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Ruler className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No hay mediciones{search || statusFilter !== "all" ? " con estos filtros" : ""}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((session) => {
            const statusConf = STATUS_CONFIG[session.status];
            return (
              <Link key={session.id} href={`/mediciones/${session.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{session.session_number}</span>
                          <Badge variant="secondary" className={cn("text-xs", statusConf.color)}>
                            {statusConf.label}
                          </Badge>
                        </div>
                        {session.project && (
                          <p className="text-sm text-muted-foreground truncate">
                            {session.project.name || session.project.project_number}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                          {session.room_name && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {session.room_name}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(session.measurement_date).toLocaleDateString("es-ES")}
                          </span>
                          {session.measured_by_profile && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {session.measured_by_profile.full_name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="text-right text-xs space-y-1">
                          <div>{session.total_points} cotas</div>
                          {session.warnings_count > 0 && (
                            <div className="text-yellow-600">{session.warnings_count} avisos</div>
                          )}
                          {session.errors_count > 0 && (
                            <div className="text-red-600">{session.errors_count} errores</div>
                          )}
                        </div>
                        {onDelete && (isAdmin || session.created_by === currentUserId) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDeleteTarget(session.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar medición</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán la sesión, todas sus fotos y puntos de medición. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget && onDelete) {
                  onDelete(deleteTarget);
                }
                setDeleteTarget(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
