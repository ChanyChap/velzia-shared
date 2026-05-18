"use client";

import { FileIcon, FileTextIcon, Download } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ChatAttachment } from "./types";

interface ChatAttachmentPreviewProps {
  attachments: ChatAttachment[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(type: string): boolean {
  return type.startsWith("image/");
}

function isPdf(type: string): boolean {
  return type === "application/pdf";
}

function downloadHref(url: string): string {
  return `/api/chat/attachments/download?url=${encodeURIComponent(url)}`;
}

export function ChatAttachmentPreview({
  attachments,
}: ChatAttachmentPreviewProps) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {attachments.map((attachment, index) => {
        if (isImage(attachment.type)) {
          return (
            <a
              key={index}
              href={downloadHref(attachment.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-md overflow-hidden border border-border hover:opacity-90 transition-opacity"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={downloadHref(attachment.thumbnail_url || attachment.url)}
                alt={attachment.name}
                className="max-w-[200px] max-h-[200px] object-cover"
              />
            </a>
          );
        }

        if (isPdf(attachment.type)) {
          return (
            <a
              key={index}
              href={downloadHref(attachment.url)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md border border-border",
                "bg-red-50 hover:bg-red-100 transition-colors text-sm"
              )}
            >
              <FileTextIcon className="h-5 w-5 text-red-600 shrink-0" />
              <span className="truncate max-w-[150px]">{attachment.name}</span>
              <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </a>
          );
        }

        return (
          <a
            key={index}
            href={downloadHref(attachment.url)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md border border-border",
              "bg-muted/50 hover:bg-muted transition-colors text-sm"
            )}
          >
            <FileIcon className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="truncate max-w-[150px]">{attachment.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatFileSize(attachment.size)}
              </span>
            </div>
            <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </a>
        );
      })}
    </div>
  );
}
