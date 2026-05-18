"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { cn } from "../../lib/utils";

interface SearchResult {
  id: string;
  content: string;
  created_at: string;
  priority: "normal" | "urgente" | "tarea";
  sender_name: string;
  sender_avatar: string | null;
}

interface ChatSearchPanelProps {
  channelId: string;
  open: boolean;
  onClose: () => void;
  onSelectMessage: (messageId: string) => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const time = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  if (msgDate.getTime() === today.getTime()) return `Hoy ${time}`;
  if (msgDate.getTime() === yesterday.getTime()) return `Ayer ${time}`;
  return `${date.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} ${time}`;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function ChatSearchPanel({ channelId, open, onClose, onSelectMessage }: ChatSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setResults([]);
      setSearched(false);
    }
  }, [open]);

  const doSearch = useCallback(
    async (term: string) => {
      if (term.length < 2) {
        setResults([]);
        setSearched(false);
        return;
      }
      setLoading(true);
      setSearched(true);
      try {
        const res = await fetch(
          `/api/chat/channels/${channelId}/search?q=${encodeURIComponent(term)}`
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    },
    [channelId]
  );

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 400);
  };

  if (!open) return null;

  return (
    <div className="border-b bg-background px-3 py-2 space-y-2">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Buscar mensajes en este chat..."
          className="h-8 text-sm"
        />
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {loading && (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          No se encontraron mensajes
        </p>
      )}

      {results.length > 0 && (
        <div className="max-h-60 overflow-y-auto space-y-1">
          {results.map((r) => (
            <button
              key={r.id}
              className="w-full text-left px-2 py-1.5 rounded-md hover:bg-muted transition-colors flex items-start gap-2"
              onClick={() => {
                onSelectMessage(r.id);
                onClose();
              }}
            >
              <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                {r.sender_avatar && <AvatarImage src={r.sender_avatar} />}
                <AvatarFallback className="text-[9px]">{getInitials(r.sender_name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium truncate">{r.sender_name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{formatDate(r.created_at)}</span>
                  {r.priority === "urgente" && (
                    <span className="text-[9px] font-semibold text-white bg-orange-500 rounded px-1 leading-none uppercase">Urgente</span>
                  )}
                  {r.priority === "tarea" && (
                    <span className="text-[9px] font-semibold text-white bg-blue-500 rounded px-1 leading-none uppercase">Tarea</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {highlightMatch(r.content.slice(0, 150), query)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
