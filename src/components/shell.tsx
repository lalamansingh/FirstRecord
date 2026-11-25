"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  FilePlus2,
  ListChecks,
  Archive,
  BarChart3,
  Users,
  Settings,
  Bell,
  Search,
  Menu,
  X,
  LogOut,
  User,
  Languages,
  ChevronDown,
  Inbox as InboxIcon,
  Megaphone,
  Siren,
  Scale,
  Building2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cx } from "./ui";
import { useT } from "@/lib/i18n/client";
import { logoutAction } from "@/app/login/actions";
import { setUiLanguageAction as setLanguageAction } from "@/app/language-actions";

const ICONS = {
  overview: LayoutDashboard,
  cases: FolderKanban,
  new: FilePlus2,
  tasks: ListChecks,
  records: Archive,
  analytics: BarChart3,
  users: Users,
  settings: Settings,
  online: InboxIcon,
  updates: Megaphone,
  sos: Siren,
  legal: Scale,
};

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** Optional count pill (e.g. pending items). */
  badge?: number;
  /** Sidebar section; derived from href when omitted. */
  group?: "work" | "information" | "admin" | "emergency";
}

interface ShellUser {
  name: string;
  email: string;
  roleName: string;
  stationName: string | null;
  stationCode: string | null;
}

/** Shell-level interface strings (English + Hindi); other languages use the shared message catalog. */
const UI: Record<string, Record<string, string>> = {
  en: {
    Overview: "Overview",
    Cases: "Cases",
    "New Report": "New Report",
    Tasks: "Tasks",
    Records: "Records",
    "Reports & Analytics": "Reports & Analytics",
    "Users & Roles": "Users & Roles",
    Settings: "Settings",
    "Online Complaints": "Online Complaints",
    Updates: "Updates",
    SOS: "SOS alerts",
    navHeading: "Main menu",
    work: "Work",
    information: "Information",
    admin: "Administration",
    emergency: "Emergency",
    collapse: "Collapse sidebar",
    expand: "Expand sidebar",
    search: "Search case reference, title or task…",
    language: "Language",
    notifications: "Notifications",
    profile: "Profile & preferences",
    signOut: "Sign out",
    footer: "Internal records system. Drafts and reviews are not official filings.",
  },
  hi: {
    Overview: "अवलोकन",
    Cases: "मामले",
    "New Report": "नई रिपोर्ट",
    Tasks: "कार्य",
    Records: "अभिलेख",
    "Reports & Analytics": "रिपोर्ट और विश्लेषण",
    "Users & Roles": "उपयोगकर्ता और भूमिकाएँ",
    Settings: "सेटिंग्स",
    "Online Complaints": "ऑनलाइन शिकायतें",
    Updates: "अपडेट",
    SOS: "SOS अलर्ट",
    navHeading: "मुख्य मेनू",
    work: "कार्य",
    information: "जानकारी",
    admin: "प्रशासन",
    emergency: "आपातकाल",
    collapse: "साइडबार छोटा करें",
    expand: "साइडबार बड़ा करें",
    search: "मामला संदर्भ, शीर्षक या कार्य खोजें…",
    language: "भाषा",
    notifications: "सूचनाएँ",
    profile: "प्रोफ़ाइल और प्राथमिकताएँ",
    signOut: "साइन आउट",
    footer: "आंतरिक अभिलेख प्रणाली। ड्राफ्ट और समीक्षा आधिकारिक दर्ज नहीं हैं।",
  },
};

const GROUP_ORDER = ["work", "information", "admin"] as const;

function groupOf(item: NavItem): NonNullable<NavItem["group"]> {
  if (item.group) return item.group;
  if (item.icon === "sos" || item.href.startsWith("/sos")) return "emergency";
  if (/^\/(admin|settings)/.test(item.href)) return "admin";
  if (/^\/(records|updates|analytics|notifications|search)/.test(item.href)) return "information";
  return "work";
}

/* Desktop sidebar collapse, persisted in localStorage (read via an external store to stay hydration-safe). */
const COLLAPSE_KEY = "fr_sidebar_collapsed";
const collapseListeners = new Set<() => void>();
function subscribeCollapse(cb: () => void) {
  collapseListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    collapseListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readCollapse() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeCollapse(v: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
  collapseListeners.forEach((l) => l());
}

export function AppShell({
  nav,
  user,
  unread,
  language,
  languages,
  children,
}: {
  nav: NavItem[];
  user: ShellUser;
  unread: number;
  language: string;
  languages: { code: string; native: string }[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    // Close the mobile menu after navigation (state adjustment during render).
    setLastPath(pathname);
    setOpen(false);
  }
  const collapsed = useSyncExternalStore(subscribeCollapse, readCollapse, () => false);
  const catalog = useT() as unknown as (k: string) => string;
  const dict = UI[language];
  const tr = (k: string) => dict?.[k] ?? (UI.en[k] && catalog(UI.en[k]) !== UI.en[k] ? catalog(UI.en[k]) : catalog(k) !== k ? catalog(k) : UI.en[k] ?? k);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  const emergency = nav.filter((i) => groupOf(i) === "emergency");
  const groups = GROUP_ORDER.map((g) => ({ key: g, items: nav.filter((i) => groupOf(i) === g) })).filter((g) => g.items.length);
  const mini = collapsed && !open; // icon-only rail on desktop

  const navList = (
    <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-4" lang={language} aria-label={tr("navHeading")}>
      {groups.map((g, gi) => (
        <div key={g.key} className={gi ? "mt-5" : undefined}>
          <p className={cx("px-3 pb-1.5 text-xs font-medium text-[var(--sidebar-label)]", mini && "lg:sr-only")}>{tr(g.key)}</p>
          {mini && gi > 0 && <span className="mx-3 mb-3 hidden h-px bg-white/10 lg:block" aria-hidden />}
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <NavLink key={item.href} item={item} label={tr(item.label)} active={isActive(item.href)} mini={mini} />
            ))}
          </ul>
        </div>
      ))}
      {emergency.length > 0 && (
        <div className="mt-5">
          <p className={cx("px-3 pb-1.5 text-xs font-medium text-[var(--sidebar-label)]", mini && "lg:sr-only")}>{tr("emergency")}</p>
          <ul className="space-y-0.5">
            {emergency.map((item) => (
              <NavLink key={item.href} item={item} label={tr(item.label)} active={isActive(item.href)} mini={mini} danger />
            ))}
          </ul>
        </div>
      )}
    </nav>
  );

  return (
    <div className="min-h-screen">
      {/* Sidebar */}
      <aside
        id="primary-nav"
        className={cx(
          "on-navy fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-[var(--sidebar-bg)] text-[var(--sidebar-item)] transition-[transform,width] duration-150 lg:z-30 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          mini ? "lg:w-[var(--sidebar-w-collapsed)]" : "lg:w-[var(--sidebar-w)]",
        )}
        aria-label={tr("Primary navigation")}
      >
        <div className={cx("flex h-14 shrink-0 items-center border-b border-white/[0.08] px-4", mini ? "lg:justify-center lg:px-0" : "justify-between")}>
          <Link href="/" className="flex min-w-0 items-center rounded-md" aria-label={tr("FirstRecord home")}>
            <Wordmark inverted compact={mini} />
          </Link>
          <button className="rounded-md p-2 text-[var(--sidebar-item)] hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label={tr("Close menu")}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {user.stationName && !mini && (
          <div className="mx-3 mt-3 flex shrink-0 items-center gap-2.5 border-b border-white/[0.08] px-3 pb-3">
            <Building2 className="h-4 w-4 shrink-0 text-[var(--sidebar-label)]" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-white" title={user.stationName}>{user.stationName}</p>
              {user.stationCode && <p className="text-[11px] text-[var(--sidebar-label)]">{user.stationCode}</p>}
            </div>
          </div>
        )}
        {navList}
        <div className={cx("shrink-0 border-t border-white/[0.08] bg-[var(--sidebar-bg)] px-3 py-3", mini && "lg:px-2")}>
          {!mini && <p className="px-2 pb-3 text-[11.5px] leading-5 text-[var(--sidebar-label)] [@media(max-height:820px)]:hidden" lang={language}>{tr("footer")}</p>}
          <button
            type="button"
            onClick={() => writeCollapse(!collapsed)}
            className={cx("hidden min-h-9 w-full items-center gap-2 rounded-md px-2 text-[13px] text-[var(--sidebar-label)] transition-colors hover:bg-white/[0.06] hover:text-white lg:flex", mini && "justify-center")}
            aria-label={collapsed ? tr("expand") : tr("collapse")}
            title={collapsed ? tr("expand") : tr("collapse")}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
            {!mini && <span>{tr("collapse")}</span>}
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-40 bg-slate-900/50 animate-fade-in lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <div className={cx("flex min-h-screen flex-col transition-[padding] duration-150", mini ? "lg:pl-[var(--sidebar-w-collapsed)]" : "lg:pl-[var(--sidebar-w)]")}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-white">
          <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
            <button
              className="rounded-md p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label={tr("Open menu")}
              aria-expanded={open}
              aria-controls="primary-nav"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/" className="flex shrink-0 items-center rounded-md lg:hidden" aria-label={tr("FirstRecord home")}>
              <Wordmark />
            </Link>
            <div className="hidden w-full max-w-lg sm:block">
              <GlobalSearch placeholder={tr("search")} />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
              <LanguageSelect current={language} languages={languages} label={tr("language")} />
              <Link
                href="/notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                aria-label={unread ? `${tr("notifications")}, ${unread} unread` : tr("notifications")}
              >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute right-0.5 top-0.5 min-w-[1.1rem] rounded-full bg-[var(--danger)] px-1 text-center text-[10px] font-semibold leading-[1.1rem] text-white ring-2 ring-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
              <span className="mx-1 hidden h-6 w-px bg-slate-200 md:block" aria-hidden />
              <UserMenu user={user} tr={tr} />
            </div>
          </div>
          <div className="px-3 pb-3 sm:hidden">
            <GlobalSearch placeholder={tr("search")} />
          </div>
        </header>

        <main id="main" className="mx-auto w-full min-w-0 max-w-[1360px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavLink({ item, label, active, mini, danger }: { item: NavItem; label: string; active: boolean; mini: boolean; danger?: boolean }) {
  const Icon = ICONS[item.icon];
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        title={mini ? label : undefined}
        className={cx(
          "group relative flex min-h-9 items-center gap-3 rounded-md px-3 py-1.5 text-[13.5px] font-medium leading-5 transition-colors",
          mini && "lg:justify-center lg:px-0",
          active ? "bg-[var(--sidebar-active)] text-white" : "text-[var(--sidebar-item)] hover:bg-white/[0.05] hover:text-white",
        )}
      >
        {active && <span className="absolute inset-y-1.5 left-0 w-[2px] rounded-r bg-[var(--sidebar-accent)]" aria-hidden />}
        <Icon
          className={cx("h-[18px] w-[18px] shrink-0", active ? "text-white" : "text-[var(--sidebar-label)] group-hover:text-[var(--sidebar-item)]")}
          aria-hidden
        />
        <span className={cx("line-clamp-2 min-w-0 break-words leading-5", mini && "lg:sr-only")}>{label}</span>
        {danger && <span className={cx("ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[#f04438]", mini && "lg:absolute lg:right-2 lg:top-2 lg:ml-0")} aria-hidden />}
        {item.badge !== undefined && item.badge > 0 && (
          <span
            className={cx(
              "ml-auto rounded-full px-1.5 text-[11px] font-semibold tabular-nums leading-5",
              "bg-white/15 text-white",
              mini && "lg:absolute lg:right-1.5 lg:top-1 lg:ml-0 lg:min-w-4 lg:px-1 lg:text-[9px] lg:leading-4",
            )}
          >
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </Link>
    </li>
  );
}

/** Text-only wordmark. Deliberately no badge, seal, emblem or insignia. */
/** Shared message catalog lookup for shell sub-components (unknown keys are returned as-is). */
function useCatalog(): (k: string) => string {
  return useT() as unknown as (k: string) => string;
}

function Wordmark({ inverted, compact }: { inverted?: boolean; compact?: boolean }) {
  const st = useCatalog();
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={cx(
          "h-8 w-8 shrink-0 items-center justify-center rounded-md text-[12px] font-bold tracking-tight",
          inverted ? "flex bg-white text-[var(--sidebar-bg)]" : "hidden bg-[var(--brand)] text-white min-[400px]:flex",
        )}
        aria-hidden
      >
        FR
      </span>
      <span className={cx("leading-tight", compact && "lg:hidden")}>
        <span className={cx("block text-[15px] font-semibold", inverted ? "text-white" : "text-slate-900")}>
          FirstRecord
        </span>
        <span className={cx("hidden text-[11px] sm:block", inverted ? "text-[var(--sidebar-label)]" : "text-slate-500")}>
          {st("Case & statement records")}
        </span>
      </span>
    </span>
  );
}

function LanguageSelect({ current, languages, label }: { current: string; languages: { code: string; native: string }[]; label: string }) {
  const st = useCatalog();
  const formRef = useRef<HTMLFormElement>(null);
  if (languages.length < 2) return null;
  return (
    <form ref={formRef} action={setLanguageAction} className="relative flex items-center">
      <label htmlFor="ui-language" className="sr-only">{label}</label>
      <Languages className="pointer-events-none absolute left-2.5 h-4 w-4 text-slate-500" aria-hidden />
      <select
        id="ui-language"
        name="lang"
        defaultValue={current}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-9 w-[4.25rem] cursor-pointer appearance-none truncate rounded-md border border-slate-300 bg-white py-1 pl-8 pr-5 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] sm:w-auto sm:pr-8"
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.native}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 hidden h-4 w-4 text-slate-500 sm:block" aria-hidden />
      <noscript>
        <button type="submit" className="ml-1 text-xs underline">{st("Apply")}</button>
      </noscript>
    </form>
  );
}

function GlobalSearch({ placeholder }: { placeholder: string }) {
  const st = useCatalog();
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLSelectElement))) {
        if (ref.current && ref.current.offsetParent !== null) {
          e.preventDefault();
          ref.current.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q")?.toString().trim();
        if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
      <input
        ref={ref}
        name="q"
        type="search"
        aria-label={st("Search cases and tasks")}
        placeholder={placeholder}
        className="peer h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-12 text-[13px] text-slate-900 placeholder:text-slate-500 transition-colors focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
        maxLength={100}
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 font-sans text-[10.5px] font-medium text-slate-500 peer-focus:hidden md:block" aria-hidden>
        ⌘K
      </kbd>
    </form>
  );
}

function UserMenu({ user, tr }: { user: ShellUser; tr: (k: string) => string }) {
  const st = useCatalog();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const initials = user.name.replace(/\(.*?\)/g, "").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 items-center gap-2.5 rounded-md px-1.5 transition-colors hover:bg-slate-100 sm:px-2"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700" aria-hidden>
          {initials}
        </span>
        <span className="hidden text-left md:block">
          <span className="block max-w-[12rem] truncate text-[13px] font-medium leading-tight text-slate-900">{user.name}</span>
          <span className="block text-xs leading-tight text-slate-500">{st(user.roleName)}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-slate-500 md:block" aria-hidden />
        <span className="sr-only">{st("Account menu")}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 origin-top-right animate-fade-in overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-[var(--shadow-pop)]">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
            <p className="mt-1 text-xs text-slate-600">
              {st(user.roleName)}
              {user.stationCode ? ` · ${user.stationCode}` : ""}
            </p>
          </div>
          <Link role="menuitem" href="/settings?tab=profile" className="flex min-h-10 items-center gap-2 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50">
            <User className="h-4 w-4 text-slate-500" aria-hidden /> {tr("profile")}
          </Link>
          <form action={logoutAction}>
            <button role="menuitem" type="submit" className="flex min-h-10 w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-800 hover:bg-slate-50">
              <LogOut className="h-4 w-4 text-slate-500" aria-hidden /> {tr("signOut")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
