"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Users } from "lucide-react";
import { cn } from "../../lib/utils";
import type { TeamMember } from "./types";

const EQUIPO_VIRTUAL: TeamMember = {
  id: "__equipo__",
  full_name: "equipo",
  avatar_url: null,
  role: "Equipo del proyecto",
};

interface MentionAutocompleteProps {
  query: string;
  members: TeamMember[];
  onSelect: (member: TeamMember) => void;
  position: { top: number; left: number };
  onClose: () => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function MentionAutocomplete({
  query,
  members,
  onSelect,
  position,
  onClose,
}: MentionAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Add @equipo as first option if it matches the query
  const showEquipo = fuzzyMatch("equipo", query);
  const filteredMembers = members
    .filter((m) => fuzzyMatch(m.full_name, query))
    .slice(0, showEquipo ? 4 : 5);
  const filtered = showEquipo ? [EQUIPO_VIRTUAL, ...filteredMembers] : filteredMembers;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, selectedIndex, onSelect, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute z-50 w-64 bg-popover border border-border rounded-md shadow-md overflow-hidden"
      style={{ bottom: position.top, left: position.left }}
    >
      {filtered.map((member, index) => (
        <button
          key={member.id}
          className={cn(
            "flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors",
            index === selectedIndex
              ? "bg-accent text-accent-foreground"
              : "hover:bg-muted"
          )}
          onMouseEnter={() => setSelectedIndex(index)}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(member);
          }}
        >
          {member.id === "__equipo__" ? (
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-3.5 w-3.5 text-primary" />
            </div>
          ) : (
            <Avatar className="h-6 w-6">
              {member.avatar_url && <AvatarImage src={member.avatar_url} />}
              <AvatarFallback className="text-[10px]">
                {getInitials(member.full_name)}
              </AvatarFallback>
            </Avatar>
          )}
          <span className="flex-1 truncate">
            {member.id === "__equipo__" ? "@equipo" : member.full_name}
          </span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {member.role}
          </Badge>
        </button>
      ))}
    </div>
  );
}
