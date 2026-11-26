"use client";
/**
 * Command palette: ⌘K / Ctrl+K, or `window.dispatchEvent(new Event("open-command-palette"))`.
 * Navigation and quick actions are filtered by the signed-in user's permissions
 * (server action), and case search reuses the RBAC-filtered /search query.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Clock,
  FilePlus2,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Archive,
  Scale,
  Search,
  Settings,
  Siren,
  Users,
  Route,
  Bell,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n/messages";
import { paletteScope, paletteSearchCases, type PaletteCase, type PaletteScope } from "@/components/interactive/palette-actions";

type Group = "recent" | "nav" | "action" | "case";
interface Item {
  id: string;
  group: Group;
  label: string;
  sub?: string;
  href: string;
  icon: LucideIcon;
  keywords?: string;
}

const RECENT_KEY = "fr_palette_recent";
const MAX_RECENT = 5;

function readRecent(): Item[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as Omit<Item, "icon">[];
    return raw.slice(0, MAX_RECENT).map((r) => ({ ...r, group: "recent" as const, icon: Clock }));
  } catch {
    return [];
  }
}

function writeRecent(item: Item) {
  try {
    const prev = (JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as Omit<Item, "icon">[]).filter((r) => r.href !== item.href);
    const next = [{ id: item.id, group: "recent", label: item.label, sub: item.sub, href: item.href }, ...prev].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Subsequence fuzzy score: higher is better, -1 = no match. */
function fuzzy(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx >= 0) return 100 - idx;
  let ti = 0;
  let score = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    score += found === ti ? 2 : 1;
    ti = found + 1;
  }
  return score;
}

export function CommandPalette() {
  const tr = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [scope, setScope] = useState<PaletteScope | null>(null);
  const [cases, setCases] = useState<PaletteCase[]>([]);
  const [recent, setRecent] = useState<Item[]>([]);
  const [searching, startSearch] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const reqId = useRef(0);

  const show = useCallback(() => {
    restoreFocus.current = document.activeElement as HTMLElement | null;
    setRecent(readRecent());
    setQuery("");
    setCases([]);
    setActive(0);
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    setOpen(false);
    restoreFocus.current?.focus?.();
  }, []);

  // Global shortcuts + custom event from the header search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) hide();
        else show();
      }
    };
    const onEvent = () => show();
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onEvent);
    };
  }, [open, show, hide]);

  // Load permissions once, on first open.
  useEffect(() => {
    if (open && !scope) paletteScope().then(setScope).catch(() => setScope(null));
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, scope]);

  // Debounced, RBAC-filtered case search.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2 || (scope && !scope.cases)) return;
    const id = ++reqId.current;
    const t = setTimeout(() => {
      startSearch(async () => {
        const rows = await paletteSearchCases(q).catch(() => []);
        if (id === reqId.current) {
          setCases(rows);
          setActive(0);
        }
      });
    }, 160);
    return () => clearTimeout(t);
  }, [query, open, scope]);

  const baseItems = useMemo<Item[]>(() => {
    const s = scope;
    const L = (k: MsgKey) => tr(k);
    const nav: Item[] = [
      { id: "nav:/", group: "nav", label: L("Overview"), href: "/", icon: LayoutDashboard, keywords: "home dashboard" },
      ...(s?.cases ? [{ id: "nav:/cases", group: "nav" as const, label: L("Cases"), href: "/cases", icon: FolderKanban }] : []),
      ...(s?.tasks ? [{ id: "nav:/tasks", group: "nav" as const, label: L("Tasks"), href: "/tasks", icon: ListChecks }] : []),
      ...(s?.online ? [{ id: "nav:/online-complaints", group: "nav" as const, label: L("Online Complaints"), href: "/online-complaints", icon: Inbox }] : []),
      ...(s?.records ? [{ id: "nav:/records", group: "nav" as const, label: L("Records"), href: "/records", icon: Archive }] : []),
      { id: "nav:/updates", group: "nav", label: L("Updates"), href: "/updates", icon: Megaphone, keywords: "circular rules bulletin" },
      ...(s?.analytics ? [{ id: "nav:/analytics", group: "nav" as const, label: L("Reports & Analytics"), href: "/analytics", icon: BarChart3 }] : []),
      ...(s?.legal ? [{ id: "nav:/legal", group: "nav" as const, label: L("Legal provisions"), href: "/legal", icon: Scale, keywords: "bns ipc section dhara" }] : []),
      ...(s?.admin ? [{ id: "nav:/admin/users", group: "nav" as const, label: L("Users & Roles"), href: "/admin/users", icon: Users }] : []),
      { id: "nav:/notifications", group: "nav", label: L("Notifications"), href: "/notifications", icon: Bell },
      { id: "nav:/sos", group: "nav", label: L("SOS alerts"), href: "/sos", icon: Siren, keywords: "emergency alert" },
      { id: "nav:/settings", group: "nav", label: L("Settings"), href: "/settings", icon: Settings },
    ];
    const actions: Item[] = [
      ...(s?.newReport ? [{ id: "act:report", group: "action" as const, label: L("Create New Report"), href: "/intake/new", icon: FilePlus2, keywords: "intake statement fir" }] : []),
      ...(s?.newTask ? [{ id: "act:task", group: "action" as const, label: L("New task"), href: "/tasks/new", icon: ListChecks }] : []),
      ...(s?.sosRaise ? [{ id: "act:sos", group: "action" as const, label: L("Raise SOS"), href: "/sos", icon: Siren, keywords: "emergency siren" }] : []),
      { id: "act:track", group: "action", label: L("Track a complaint"), href: "/complaint/track", icon: Route, keywords: "tracking code status" },
      { id: "act:search", group: "action", label: L("Search"), href: "/search", icon: Search },
    ];
    return [...nav, ...actions];
  }, [scope, tr]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim();
    const caseItems: Item[] = (q.length >= 2 ? cases : []).map((c) => ({
      id: `case:${c.id}`,
      group: "case",
      label: c.reference,
      sub: c.title,
      href: `/cases/${c.id}`,
      icon: FolderKanban,
    }));
    if (!q) return [...recent, ...baseItems];
    const ranked = baseItems
      .map((it) => ({ it, s: Math.max(fuzzy(q, it.label), fuzzy(q, it.keywords ?? "")) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.it);
    return [...ranked, ...caseItems];
  }, [query, baseItems, cases, recent]);

  // Keep the active row scrolled into view.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (it: Item | undefined) => {
    if (!it) return;
    writeRecent(it);
    setOpen(false);
    router.push(it.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (items.length ? (a + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, items.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      hide();
    } else if (e.key === "Tab") {
      e.preventDefault(); // keep focus inside the dialog
    }
  };

  if (!open) return null;

  const groupLabel: Record<Group, string> = {
    recent: tr("Recent"),
    nav: tr("Go to"),
    action: tr("Quick actions"),
    case: tr("Matching cases"),
  };
  const activeId = items[active] ? `cp-opt-${active}` : undefined;
  const q = query.trim();

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]" role="presentation">
      <div className="absolute inset-0 bg-[#111216]/40 motion-safe:animate-[fadeIn_120ms_ease-out]" onClick={hide} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr("Command palette")}
        className="relative w-full max-w-[600px] overflow-hidden rounded-[14px] border border-[#E6E4DE] bg-white shadow-[0_24px_64px_-12px_rgba(17,18,22,0.28)] motion-safe:animate-[fadeIn_140ms_ease-out]"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-[#E6E4DE] px-4">
          <Search className="h-[18px] w-[18px] shrink-0 text-[#5B5E66]" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="cp-list"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label={tr("Search or jump to…")}
            placeholder={tr("Search or jump to…")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            maxLength={100}
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-[#111216] outline-none focus-visible:outline-none placeholder:text-[#A7B0AC]"
            style={{ outline: "none" }}
          />
          {searching && <span className="text-xs text-[#5B5E66]" role="status">{tr("Searching…")}</span>}
          <kbd className="hidden rounded-md border border-[#E6E4DE] bg-[#FAFAF7] px-1.5 py-0.5 font-mono text-[11px] text-[#5B5E66] sm:inline">Esc</kbd>
        </div>

        <ul id="cp-list" ref={listRef} role="listbox" aria-label={tr("Command palette")} className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {items.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-[#5B5E66]">
              {q.length > 0 && q.length < 2 && scope?.cases ? tr("Type 2+ characters to search cases") : searching ? tr("Searching…") : tr("No results")}
            </li>
          )}
          {items.map((it, i) => {
            const first = i === 0 || items[i - 1].group !== it.group;
            const Icon = it.icon;
            const isActive = i === active;
            return (
              <li key={`${it.group}-${it.id}`} role="none">
                {first && <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.06em] text-[#5B5E66] first:pt-1" aria-hidden>{groupLabel[it.group]}</p>}
                <div
                  id={`cp-opt-${i}`}
                  role="option"
                  aria-selected={isActive}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(it)}
                  className={`flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-colors ${isActive ? "bg-[#9DF0C4] text-[#111216]" : "text-[#111216] hover:bg-[#FAFAF7]"}`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isActive ? "bg-white/70" : "bg-[#F3F3EF]"}`} aria-hidden>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${it.group === "case" ? "font-mono text-[13px] font-medium" : "font-medium"}`}>{it.label}</span>
                    {it.sub && <span className="block truncate text-xs text-[#4E545A]">{it.sub}</span>}
                  </span>
                  {isActive && <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#E6E4DE] bg-[#FAFAF7] px-4 py-2 text-[11px] text-[#5B5E66]">
          <span><kbd className="font-mono">↑ ↓</kbd> {tr("to navigate")}</span>
          <span><kbd className="font-mono">↵</kbd> {tr("to open")}</span>
          <span><kbd className="font-mono">Esc</kbd> {tr("to close")}</span>
          <span className="ml-auto hidden font-mono sm:inline">⌘K</span>
        </div>
      </div>
    </div>
  );
}
