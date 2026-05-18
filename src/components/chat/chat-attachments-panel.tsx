"use client";

import { useState, useEffect } from "react";
import { X, Loader2, FileText, Image as ImageIcon, File, Download } from "lucide-react";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";

interface AttachmentItem {
  name: string;
  url: string;
  type: string;
  size: number;
  thumbnail_url?: string;
  message_id: string;
  sender_name: string;
  created_at: string;
}

interface ChatAttachmentsPanelProps {
  channelId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDate.getTime() === today.getTime()) return "Hoy";
  if (msgDate.getTime() === yesterday.getTime()) return "Ayer";
  return date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function isImage(type: string): boolean {
  return type.startsWith("image/");
}

function downloadHref(url: string): string {
  return `/api/chat/attachments/download?url=${encodeURIComponent(url)}`;
}

function isPdf(type: string): boolean {
  return type === "application/pdf" || type.includes("pdf");
}

function getFileIcon(type: string) {
  if (isImage(type)) return <ImageIcon className="h-5 w-5 text-blue-500" />;
  if (isPdf(type)) return <FileText className="h-5 w-5 text-red-500" />;
  return <File className="h-5 w-5 text-gray-500" />;
}

export function ChatAttachmentsPanel({ channelId, open, onOpenChange }: ChatAttachmentsPanelProps) {
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !channelId) return;
    setLoading(true);
    fetch(`/api/chat/channels/${channelId}/attachments`)
      .then((res) => (res.ok ? res.json() : { attachments: [] }))
      .then((data) => setAttachments(data.attachments || []))
      .catch(() => setAttachments([]))
      .finally(() => setLoading(false));
  }, [open, channelId]);

  // Group by date
  const grouped = new Map<string, AttachmentItem[]>();
  for (const att of attachments) {
    const dateKey = formatDate(att.created_at);
    const existing = grouped.get(dateKey);
    if (existing) existing.push(att);
    else grouped.set(dateKey, [att]);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[340px] sm:w-[400px] p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="text-sm font-semibold">
            Documentos compartidos en el chat
          </SheetTitle>
        </SheetHeader>

        <div className="overflow-y-auto h-[calc(100%-60px)] px-4 py-3">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && attachments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No se han compartido documentos en este chat
            </p>
          )}

          {!loading && Array.from(grouped.entries()).map(([dateKey, items]) => (
            <div key={dateKey} className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">{dateKey}</p>
              <div className="space-y-2">
                {items.map((att, idx) => (
                  <a
                    key={`${att.message_id}-${idx}`}
                    href={downloadHref(att.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-2 rounded-lg border hover:bg-muted/50 transition-colors group"
                  >
                    {/* Thumbnail or icon */}
                    {isImage(att.type) && att.thumbnail_url ? (
                      <img
                        src={downloadHref(att.thumbnail_url || att.url)}
                        alt={att.name}
                        className="h-10 w-10 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                        {getFileIcon(att.type)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{att.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatFileSize(att.size)} &middot; {att.sender_name}
                      </p>
                    </div>
                    <Download className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
