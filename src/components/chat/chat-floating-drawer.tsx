"use client";

import { MessageCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { ProjectChatPanel } from "./project-chat-panel";

interface ChatFloatingDrawerProps {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChatFloatingDrawer({
  projectId,
  projectName,
  open,
  onOpenChange,
}: ChatFloatingDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/*
        Desktop (sm+): floating window docked bottom-right — 640px wide, ~85vh tall,
        rounded corners + shadow. Leaves project content visible behind.
        Mobile: full-screen panel (best for on-screen keyboard + comfortable typing).
      */}
      <SheetContent
        side="right"
        className="
          p-0 flex flex-col
          inset-y-0 right-0 h-full w-full max-w-full
          sm:inset-y-auto sm:top-auto sm:bottom-4 sm:right-4
          sm:h-[85vh] sm:max-h-[900px]
          sm:w-[640px] sm:max-w-[640px]
          sm:rounded-2xl sm:border sm:shadow-2xl
        "
      >
        <SheetHeader className="px-4 py-3 border-b shrink-0 pr-10">
          <div className="flex items-center gap-2.5 text-left">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessageCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Chat del proyecto
              </div>
              <SheetTitle className="text-sm font-semibold truncate leading-tight">
                {projectName}
              </SheetTitle>
            </div>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <ProjectChatPanel
            projectId={projectId}
            projectName={projectName}
            compact
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
