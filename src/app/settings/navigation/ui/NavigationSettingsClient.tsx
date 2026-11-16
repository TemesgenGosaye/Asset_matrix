"use client";

/**
 * Settings → Navigation
 *
 * A live editor for the user's own menu visibility. Three things make it behave
 * the way a settings page should rather than the way a form usually does:
 *
 *  1. IT EDITS THE REAL SIDEBAR. Every switch writes to the working set held by
 *     `NavigationPreferencesProvider`, which is the same store the sidebar and
 *     the mobile sheet read. So the chrome changes under the user's hands,
 *     before anything is saved, and "Save changes" is about persistence rather
 *     than about making the change visible.
 *  2. IT SHOWS ONLY WHAT THE USER MAY EDIT. The list is built from
 *     `getAccessibleSections`, the same RBAC gate the chrome uses, so a menu the
 *     role cannot reach is not offered — hiding a link is a preference, never a
 *     grant, and this page must not imply otherwise.
 *  3. LOCKED ITEMS STAY LOCKED. Dashboard and Navigation Settings are marked
 *     `locked` in the registry; their switches are disabled with a reason, so a
 *     user can never hide the page that would unhide everything.
 */

import React, { useCallback, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  Eye,
  EyeOff,
  LayoutDashboard,
  Loader2,
  Lock,
  Megaphone,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { notify } from "@/lib/feedback/notify";
import { useNavigationPreferences } from "@/contexts/NavigationPreferencesContext";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { useNavLabel, useNavSectionTitle } from "@/lib/navigation/labels";
import {
  applyHiddenKeys,
  flattenSectionItems,
  getAccessibleSections,
  isActivePath,
  type NavRegistryItem,
  type NavRegistrySection,
} from "@/lib/navigation/registry";

interface NavigationSettingsClientProps {
  /** Server-resolved admin flag. */
  isAdmin: boolean;
  /** Server-resolved permission strings. */
  permissions: string[];
}

/** Every hideable key in a section, parents and children alike. */
function sectionKeys(section: NavRegistrySection): string[] {
  return flattenSectionItems([section])
    .filter((item) => !item.locked)
    .map((item) => item.key);
}

/** Case-insensitive match against every label the user could search by. */
function itemMatches(
  item: NavRegistryItem,
  query: string,
  labelFor: (item: NavRegistryItem) => string,
): boolean {
  const haystack = [
    labelFor(item),
    item.label,
    item.description ?? "",
    item.key,
    item.href,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export default function NavigationSettingsClient({
  isAdmin,
  permissions,
}: NavigationSettingsClientProps) {
  const {
    hiddenKeyList,
    savedHiddenKeys,
    orgHiddenKeys,
    isDirty,
    saving,
    setHiddenKeys,
    toggleKey,
    save,
    discard,
    resetToDefaults,
    saveAsOrgDefault,
    clearOrgDefault,
  } = useNavigationPreferences();

  const labelFor = useNavLabel();
  const titleFor = useNavSectionTitle();
  useUnsavedChanges(isDirty);

  const [query, setQuery] = useState("");
  const [closedSections, setClosedSections] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const hidden = useMemo(() => new Set(hiddenKeyList), [hiddenKeyList]);

  // The same RBAC gate the chrome uses, so an item the role cannot reach is not
  // listed at all. Sections that end up empty are dropped by the helper.
  const sections = useMemo(
    () => getAccessibleSections(isAdmin, new Set(permissions)),
    [isAdmin, permissions],
  );

  // The groups that start switched ON, derived from the registry rather than
  // hardcoded so the summary can never drift from the real defaults: every
  // section that does not opt out, plus any item that re-shows itself inside a
  // section that does (Admin Settings).
  const defaultOnLabels = useMemo(() => {
    const labels: string[] = [];
    for (const section of sections) {
      if (section.defaultVisible === false) {
        for (const item of flattenSectionItems([section])) {
          if (!item.locked && item.defaultVisible === true) {
            labels.push(labelFor(item));
          }
        }
      } else {
        labels.push(titleFor(section));
      }
    }
    return labels;
  }, [sections, labelFor, titleFor]);

  const hideableItems = useMemo(
    () =>
      flattenSectionItems(sections).filter((item) => item.locked !== true),
    [sections],
  );
  const lockedCount = useMemo(
    () => flattenSectionItems(sections).filter((item) => item.locked).length,
    [sections],
  );
  const visibleCount = hideableItems.filter(
    (item) => !hidden.has(item.key),
  ).length;
  const hiddenCount = hideableItems.length - visibleCount;

  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const filteredSections = useMemo(() => {
    if (!isSearching) return sections;
    return sections.reduce<NavRegistrySection[]>((acc, section) => {
      const items = section.items.filter((item) =>
        itemMatches(item, normalizedQuery, labelFor),
      );
      if (items.length > 0) acc.push({ ...section, items });
      return acc;
    }, []);
  }, [sections, normalizedQuery, isSearching, labelFor]);

  const setSectionOpen = useCallback((key: string, open: boolean) => {
    setClosedSections((prev) => {
      const next = new Set(prev);
      if (open) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setSectionVisible = useCallback(
    (section: NavRegistrySection, visible: boolean) => {
      const next = new Set(hidden);
      for (const key of sectionKeys(section)) {
        if (visible) next.delete(key);
        else next.add(key);
      }
      setHiddenKeys(next);
    },
    [hidden, setHiddenKeys],
  );

  return (
    <div className="pt-4 pb-6">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <header className="app-chrome relative overflow-hidden rounded-xl border shadow-sm">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "radial-gradient(60rem 20rem at 8% -30%, #e8c874 0%, transparent 60%), radial-gradient(40rem 16rem at 100% 120%, #c9a227 0%, transparent 55%)",
          }}
        />
        <div className="relative flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <span className="from-primary/80 to-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-primary-foreground shadow-sm">
              <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-chrome-foreground text-xl font-semibold tracking-tight">
                Navigation
              </h1>
              <p className="text-chrome-muted mt-1 max-w-2xl text-sm leading-relaxed">
                Choose which menu items appear in your sidebar, top bar and
                mobile menu. This only changes what you see — it never changes
                what your role is allowed to do.
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              icon={<Eye className="h-3.5 w-3.5" aria-hidden="true" />}
              label="Menus visible"
              value={`${visibleCount} of ${hideableItems.length}`}
            />
            <Stat
              icon={<EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
              label="Hidden"
              value={String(hiddenCount)}
            />
            <Stat
              className="col-span-2 sm:col-span-1"
              icon={<Lock className="h-3.5 w-3.5" aria-hidden="true" />}
              label="Always shown"
              value={String(lockedCount)}
            />
          </dl>
        </div>
      </header>

      {/* ─── Defaults & system preferences ──────────────────────────────── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <MenuPreferencesCard defaultOnLabels={defaultOnLabels} />
        <SystemPreferencesCard />
      </div>

      {/* ─── Search ─────────────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="text-chrome-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search menus…"
            aria-label="Search menu items"
            autoFocus
            className="pl-9"
          />
        </div>
        <p className="text-chrome-muted text-xs" role="status">
          {isDirty ? "You have unsaved changes" : "All changes saved"}
        </p>
      </div>

      {/* ─── Body ───────────────────────────────────────────────────────── */}
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          {filteredSections.length === 0 ? (
            <div className="rounded-xl border border-dashed py-4">
              <EmptyState
                icon={<Search className="h-8 w-8" aria-hidden="true" />}
                title="No menus match your search"
                description={`Nothing in your navigation matches “${query.trim()}”. Try a different word.`}
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQuery("")}
                  >
                    Clear search
                  </Button>
                }
              />
            </div>
          ) : (
            filteredSections.map((section) => (
              <SectionCard
                key={section.key}
                section={section}
                title={titleFor(section)}
                hidden={hidden}
                open={!closedSections.has(section.key)}
                onOpenChange={(open) => setSectionOpen(section.key, open)}
                onSetSectionVisible={(visible) =>
                  setSectionVisible(section, visible)
                }
                onToggleItem={toggleKey}
                labelFor={labelFor}
              />
            ))
          )}

          {isAdmin && (
            <OrgDefaultCard
              orgHiddenKeys={orgHiddenKeys}
              saving={saving}
              onSaveAsDefault={saveAsOrgDefault}
              onClearDefault={clearOrgDefault}
            />
          )}
        </div>

        {/* Live preview — the real chrome already reflects these switches, but a
            compact copy keeps the effect visible next to the controls. */}
        <aside className="hidden lg:block">
          <div className="sticky top-4">
            <SidebarPreview
              sections={sections}
              hidden={hidden}
              labelFor={labelFor}
              titleFor={titleFor}
            />
          </div>
        </aside>
      </div>

      {/* ─── Sticky action bar ──────────────────────────────────────────── */}
      <div className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky bottom-0 z-30 mt-6 rounded-xl border p-3 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            {isDirty ? (
              <>
                <span
                  className="bg-brass-500 h-2 w-2 rounded-full"
                  aria-hidden="true"
                />
                <span className="text-foreground font-medium">
                  Unsaved changes
                </span>
              </>
            ) : (
              <>
                <ShieldCheck
                  className="text-muted-foreground h-4 w-4"
                  aria-hidden="true"
                />
                <span className="text-muted-foreground">
                  Saved — {savedHiddenKeys.length} hidden{" "}
                  {savedHiddenKeys.length === 1 ? "menu" : "menus"}
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetToDefaults}
              disabled={saving}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset to defaults
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={discard}
              disabled={!isDirty || saving}
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              Discard
            </Button>
            <Button size="sm" onClick={save} disabled={!isDirty || saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Stat({
  icon,
  label,
  value,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-chrome-border bg-chrome-hover/50 rounded-lg border px-3 py-2",
        className,
      )}
    >
      <dt className="text-chrome-muted flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
        {icon}
        {label}
      </dt>
      <dd className="text-chrome-foreground mt-0.5 text-lg font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/** Small pill summarising whether a menu group starts on or off. */
function DefaultStateBadge({ on }: { on: boolean }) {
  const Icon = on ? Eye : EyeOff;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        on
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-muted-foreground/20 bg-muted text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {on ? "On" : "Off"}
    </span>
  );
}

/** Read-only summary of which menus ship enabled. */
function MenuPreferencesCard({
  defaultOnLabels,
}: {
  defaultOnLabels: string[];
}) {
  return (
    <section className="bg-card rounded-xl border p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-start gap-3">
        <SlidersHorizontal
          className="text-primary mt-0.5 h-4 w-4 shrink-0"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-card-foreground text-sm font-semibold">
            Menu Preferences (default settings)
          </h2>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            The menus marked On below start enabled; everything else can be
            turned on anytime in your preferences. The recommended system pop-up
            is enabled by default.
          </p>
          <ul className="mt-3 space-y-2" role="list">
            {defaultOnLabels.map((label) => (
              <li
                key={label}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-card-foreground">{label}</span>
                <DefaultStateBadge on />
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">All other menus</span>
              <DefaultStateBadge on={false} />
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/**
 * System-wide toggles for the signed-in user.
 *
 * Unlike the menu switches above — which edit the working set and are only
 * committed by "Save changes" — this writes through `UserPreferencesProvider`
 * immediately, so it saves on toggle and states its outcome with a toast.
 */
function SystemPreferencesCard() {
  const { preferences, preferencesReady, updatePreferences } =
    useUserPreferences();
  const [saving, setSaving] = useState(false);
  const enabled = preferences.showRecommendedPopup !== false;

  const handleChange = useCallback(
    async (next: boolean) => {
      setSaving(true);
      try {
        await updatePreferences({ showRecommendedPopup: next });
        notify.success({
          title: next
            ? "Recommended pop-up enabled"
            : "Recommended pop-up disabled",
          description: next
            ? "You will see the recommended system pop-up again."
            : "You will no longer see the recommended system pop-up.",
        });
      } catch {
        notify.error({
          title: "Could not update your preference",
          description: "The change was not saved. Please try again.",
        });
      } finally {
        setSaving(false);
      }
    },
    [updatePreferences],
  );

  return (
    <section className="bg-card rounded-xl border p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-start gap-3">
        <Megaphone
          className="text-primary mt-0.5 h-4 w-4 shrink-0"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-card-foreground text-sm font-semibold">
            System Preferences
          </h2>
          <div className="mt-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <label
                htmlFor="pref-recommended-popup"
                className="text-card-foreground text-sm font-medium"
              >
                Enable recommended system pop-up
              </label>
              <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                Show a professionally presented pop-up for recommended features
                and system announcements. On by default.
              </p>
            </div>
            <div className="mt-0.5 flex shrink-0 items-center gap-2">
              {saving && (
                <Loader2
                  className="text-muted-foreground h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              )}
              <Switch
                id="pref-recommended-popup"
                checked={enabled}
                disabled={!preferencesReady || saving}
                onCheckedChange={(next) => void handleChange(next)}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface SectionCardProps {
  section: NavRegistrySection;
  title: string;
  hidden: ReadonlySet<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetSectionVisible: (visible: boolean) => void;
  onToggleItem: (key: string, hidden: boolean) => void;
  labelFor: (item: NavRegistryItem) => string;
}

function SectionCard({
  section,
  title,
  hidden,
  open,
  onOpenChange,
  onSetSectionVisible,
  onToggleItem,
  labelFor,
}: SectionCardProps) {
  const keys = useMemo(() => sectionKeys(section), [section]);
  const allVisible = keys.length > 0 && keys.every((key) => !hidden.has(key));
  const totalInSection = flattenSectionItems([section]).length;
  const visibleInSection = flattenSectionItems([section]).filter(
    (item) => item.locked || !hidden.has(item.key),
  ).length;
  const hasHideable = keys.length > 0;
  const masterId = `nav-section-${section.key}`;

  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="bg-card overflow-hidden rounded-xl border shadow-[var(--shadow-sm)]"
    >
      <div className="flex items-center gap-3 p-4">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="text-card-foreground focus-visible:ring-ring flex flex-1 items-center gap-2 text-left text-sm font-semibold tracking-wide uppercase transition-colors hover:opacity-80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            aria-expanded={open}
          >
            <ChevronDown
              className={cn(
                "text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-200",
                !open && "-rotate-90",
              )}
              aria-hidden="true"
            />
            {title}
            <span className="text-muted-foreground ml-1 text-[11px] font-normal normal-case">
              {visibleInSection}/{totalInSection}
            </span>
          </button>
        </CollapsibleTrigger>

        {hasHideable && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground hidden text-xs sm:inline">
              {allVisible ? "Hide all" : "Show all"}
            </span>
            <Switch
              id={masterId}
              checked={allVisible}
              onCheckedChange={onSetSectionVisible}
              aria-labelledby={`${masterId}-label`}
            />
            <span id={`${masterId}-label`} className="sr-only">
              {`Show every menu in ${title}`}
            </span>
          </div>
        )}
      </div>

      <CollapsibleContent>
        <ul className="divide-y border-t">
          {section.items.map((item) => (
            <React.Fragment key={item.key}>
              <NavRow
                item={item}
                hidden={hidden}
                onToggleItem={onToggleItem}
                labelFor={labelFor}
              />
              {item.children?.map((child) => (
                <NavRow
                  key={child.key}
                  item={child}
                  hidden={hidden}
                  onToggleItem={onToggleItem}
                  labelFor={labelFor}
                  nested
                  parentHidden={hidden.has(item.key)}
                />
              ))}
            </React.Fragment>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface NavRowProps {
  item: NavRegistryItem;
  hidden: ReadonlySet<string>;
  onToggleItem: (key: string, hidden: boolean) => void;
  labelFor: (item: NavRegistryItem) => string;
  parentHidden?: boolean;
  nested?: boolean;
}

function NavRow({
  item,
  hidden,
  onToggleItem,
  labelFor,
  parentHidden = false,
  nested = false,
}: NavRowProps) {
  const Icon = item.icon;
  const label = labelFor(item);
  const isLocked = item.locked === true;
  // A child follows its parent: if the parent is off the child is unreachable,
  // so its switch is disabled rather than pretending to be individually true.
  const disabled = isLocked || parentHidden;
  const checked = !hidden.has(item.key);
  const switchId = `nav-item-${item.key}`;

  return (
    <li className={cn("flex items-start gap-3 px-4 py-3", nested && "pl-10")}>
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          checked && !disabled ? "text-primary" : "text-muted-foreground",
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <span
          id={`${switchId}-label`}
          className="text-card-foreground flex items-center gap-1.5 text-sm font-medium"
        >
          {label}
          {isLocked && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="text-muted-foreground inline-flex"
                  tabIndex={0}
                  aria-label="This menu cannot be hidden"
                >
                  <Lock className="h-3 w-3" aria-hidden="true" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Always shown so you cannot lose your way back to Settings.
              </TooltipContent>
            </Tooltip>
          )}
        </span>
        {item.description && (
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            {item.description}
          </p>
        )}
        {parentHidden && (
          <p className="text-muted-foreground mt-0.5 text-xs italic">
            Hidden because its parent section is off.
          </p>
        )}
      </div>
      <div className="mt-0.5 shrink-0">
        <Switch
          id={switchId}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) => onToggleItem(item.key, !next)}
          aria-labelledby={`${switchId}-label`}
        />
      </div>
    </li>
  );
}

interface SidebarPreviewProps {
  sections: NavRegistrySection[];
  hidden: ReadonlySet<string>;
  labelFor: (item: NavRegistryItem) => string;
  titleFor: (section: NavRegistrySection) => string;
}

function SidebarPreview({
  sections,
  hidden,
  labelFor,
  titleFor,
}: SidebarPreviewProps) {
  const pathname = usePathname();

  const visible = useMemo(
    () => applyHiddenKeys(sections, hidden),
    [sections, hidden],
  );

  return (
    <div className="app-chrome overflow-hidden rounded-xl border shadow-sm">
      <div className="border-chrome-border flex items-center gap-2 border-b px-3 py-2.5">
        <Eye className="text-primary h-4 w-4" aria-hidden="true" />
        <p className="text-chrome-foreground text-xs font-semibold tracking-wide uppercase">
          Preview
        </p>
      </div>
      <div className="space-y-3 p-3">
        {visible.length === 0 ? (
          <p className="text-chrome-muted px-1 py-6 text-center text-xs">
            Every optional menu is hidden. Only the locked items would remain.
          </p>
        ) : (
          visible.map((section) => (
            <div key={section.key}>
              <p className="text-chrome-muted px-1.5 pb-1 text-[10px] font-semibold tracking-wider uppercase">
                {titleFor(section)}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.key}>
                    <PreviewLink
                      item={item}
                      label={labelFor(item)}
                      active={isActivePath(pathname, item.href, item.exact)}
                    />
                    {item.children?.length ? (
                      <ul className="space-y-0.5 pl-4">
                        {item.children.map((child) => (
                          <li key={child.key}>
                            <PreviewLink
                              item={child}
                              label={labelFor(child)}
                              active={isActivePath(
                                pathname,
                                child.href,
                                child.exact,
                              )}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * A non-interactive stand-in for a sidebar link.
 *
 * Rendered as a span, not a `<Link>`: the real navigation is already on screen
 * and works, and a second set of anchors would put two identical destinations
 * in the tab order — and two decoys in every screen-reader link list.
 */
function PreviewLink({
  item,
  label,
  active,
}: {
  item: NavRegistryItem;
  label: string;
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1 text-xs",
        active
          ? "bg-primary text-primary-foreground font-medium"
          : "text-chrome-muted",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

interface OrgDefaultCardProps {
  orgHiddenKeys: string[];
  saving: boolean;
  onSaveAsDefault: () => Promise<boolean>;
  onClearDefault: () => Promise<boolean>;
}

/** Admin-only: the organisation-wide default, inherited by users who never saved. */
function OrgDefaultCard({
  orgHiddenKeys,
  saving,
  onSaveAsDefault,
  onClearDefault,
}: OrgDefaultCardProps) {
  return (
    <section className="bg-card rounded-xl border p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-start gap-3">
        <ShieldCheck
          className="text-primary mt-0.5 h-4 w-4 shrink-0"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-card-foreground text-sm font-semibold">
            Organization default
          </h2>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            A starting point for every member who has never saved their own
            navigation. Anyone who saves a preference overrides it for
            themselves. Currently{" "}
            <strong className="text-card-foreground font-semibold">
              {orgHiddenKeys.length}
            </strong>{" "}
            {orgHiddenKeys.length === 1 ? "menu is" : "menus are"} hidden by
            default.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void onSaveAsDefault()}
              disabled={saving}
            >
              Use current switches as default
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void onClearDefault()}
              disabled={saving || orgHiddenKeys.length === 0}
            >
              Clear default
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
