"use client";

import { useState } from "react";
import { ClipboardList, CheckCircle2, Calendar, Clock, Loader2 } from "lucide-react";

interface TaskBubbleProps {
  message: {
    id: string;
    content?: string | null;
    created_at: string;
    metadata?: Record<string, unknown> | null;
    sender?: { full_name?: string | null } | null;
  };
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function TaskBubble({ message }: TaskBubbleProps) {
  const [completing, setCompleting] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  const meta = message.metadata || {};
  const taskTitle = meta.task_title as string || "Tarea";
  const taskDueDate = meta.task_due_date as string | null;
  const taskDueTime = meta.task_due_time as string | null;
  const taskDescription = meta.task_description as string | null;
  const taskStatus = localStatus || (meta.task_status as string) || "pendiente";
  const taskCompletedBy = meta.task_completed_by as string | null;
  const taskCompletedAt = meta.task_completed_at as string | null;
  const taskId = meta.team_task_id as string;
  const createdBy = meta.task_created_by as string || message.sender?.full_name || "";

  const isCompleted = taskStatus === "completada";

  async function handleComplete() {
    if (!taskId || completing || isCompleted) return;
    setCompleting(true);

    try {
      const res = await fetch("/api/whatsapp/complete-task", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_task_id: taskId,
          wa_message_id: message.id,
        }),
      });

      if (res.ok) {
        setLocalStatus("completada");
      }
    } catch {
      // silent
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="flex justify-end my-1.5">
      <div className={`max-w-[65%] rounded-xl rounded-tr-sm px-3 py-2.5 shadow-sm border ${
        isCompleted
          ? "bg-emerald-50 border-emerald-200"
          : "bg-indigo-50 border-indigo-200"
      }`}>
        {/* Header */}
        <div className={`flex items-center gap-1.5 text-[10px] font-medium mb-1.5 ${
          isCompleted ? "text-emerald-600" : "text-indigo-600"
        }`}>
          {isCompleted ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : (
            <ClipboardList className="h-3 w-3" />
          )}
          Tarea {createdBy && `- ${createdBy}`}
        </div>

        {/* Title */}
        <p className={`text-sm font-semibold mb-1 ${
          isCompleted ? "text-emerald-800 line-through" : "text-indigo-900"
        }`}>
          {taskTitle}
        </p>

        {/* Description */}
        {taskDescription && (
          <p className={`text-xs mb-1.5 ${
            isCompleted ? "text-emerald-700" : "text-indigo-700"
          }`}>
            {taskDescription}
          </p>
        )}

        {/* Date/Time */}
        {(taskDueDate || taskDueTime) && (
          <div className={`flex items-center gap-2 text-[11px] mb-2 ${
            isCompleted ? "text-emerald-500" : "text-indigo-500"
          }`}>
            {taskDueDate && (
              <span className="flex items-center gap-0.5">
                <Calendar className="h-3 w-3" />
                {formatDate(taskDueDate)}
              </span>
            )}
            {taskDueTime && (
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {taskDueTime}
              </span>
            )}
          </div>
        )}

        {/* Action / Status */}
        {isCompleted ? (
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-100 rounded-md px-2 py-1 w-fit">
            <CheckCircle2 className="h-3 w-3" />
            Completada{taskCompletedBy ? ` por ${taskCompletedBy}` : ""}
            {taskCompletedAt && ` · ${formatTime(taskCompletedAt)}`}
          </div>
        ) : (
          <button
            onClick={handleComplete}
            disabled={completing}
            className="flex items-center gap-1 text-[11px] font-medium text-indigo-700 bg-indigo-100 hover:bg-indigo-200 rounded-md px-2.5 py-1 transition-colors disabled:opacity-50"
          >
            {completing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            Marcar como realizada
          </button>
        )}

        {/* Timestamp */}
        <div className="text-right mt-1.5">
          <span className={`text-[10px] ${isCompleted ? "text-emerald-400" : "text-indigo-400"}`}>
            {formatTime(message.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
