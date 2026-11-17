"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  IdCard,
  Loader2,
  RefreshCw,
  Search,
  UsersRound,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EMPLOYMENT_STATUS_BADGE_VARIANT,
  EMPLOYMENT_STATUS_LABELS,
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
  labelOrDash,
} from "@/lib/employees/constants";
import type { EmployeeDto, EmployeeListResponse } from "@/lib/employees/types";
import { cn } from "@/lib/utils";

/** Minimum characters before a search is issued, matching the global search. */
const MIN_TERM_LENGTH = 2;
/** Idle time after the last keystroke before the query is sent. */
const DEBOUNCE_MS = 300;
/** How many matches a single search returns. */
const RESULT_LIMIT = 20;

function fullName(item: Pick<EmployeeDto, "firstname" | "lastname">): string {
  return `${item.firstname} ${item.lastname}`.trim();
}

function initials(item: Pick<EmployeeDto, "firstname" | "lastname">): string {
  const first = item.firstname?.charAt(0) || "";
  const last = item.lastname?.charAt(0) || "";
  return `${first}${last}`.toUpperCase() || "E";
}

/** Wrap the first case-insensitive occurrence of `term` in a highlight mark. */
function highlight(text: string, term: string): React.ReactNode {
  const needle = term.trim();
  if (!needle) return text;
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-primary/20 text-foreground rounded px-0.5">
        {text.slice(index, index + needle.length)}
      </mark>
      {text.slice(index + needle.length)}
    </>
  );
}

export interface EmployeeDirectorySearchProps {
  /** Live employee count, used for the directory subtitle. */
  totalEmployees: number;
}

export default function EmployeeDirectorySearch({
  totalEmployees,
}: EmployeeDirectorySearchProps) {
  const router = useRouter();

  const [term, setTerm] = useState("");
  /** The term the currently displayed rows belong to (post-debounce). */
  const [activeTerm, setActiveTerm] = useState("");
  const [rows, setRows] = useState<EmployeeDto[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const requestId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const runSearch = useCallback(async (value: string) => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);

    try {
      const trimmed = value.trim();
      const params = new URLSearchParams();
      if (trimmed) params.set("search", trimmed);
      params.set("page", "1");
      params.set("pageSize", String(RESULT_LIMIT));

      const res = await fetch(`/api/employees?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Unable to search employees.");
      }

      const body: EmployeeListResponse = await res.json();
      if (id !== requestId.current) return;

      setRows(body.data);
      setTotal(body.total);
      setActiveTerm(trimmed);
      setActiveIndex(body.data.length > 0 ? 0 : -1);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(
        err instanceof Error ? err.message : "Unable to search employees.",
      );
      setRows([]);
      setTotal(0);
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, []);

  // Load the first page of the register on mount so the page starts useful.
  useEffect(() => {
    void runSearch("");
  }, [runSearch]);

  // Debounced search. A single typed character is ignored until the second
  // arrives, and an unchanged term does not re-query.
  useEffect(() => {
    const trimmed = term.trim();
    if (trimmed === activeTerm) return;
    if (trimmed.length > 0 && trimmed.length < MIN_TERM_LENGTH) return;

    const timer = setTimeout(() => {
      void runSearch(term);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, activeTerm, runSearch]);

  // Keep the keyboard cursor visible inside the scrolling result list.
  useEffect(() => {
    if (activeIndex < 0) return;
    document
      .getElementById(`employee-result-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const clearSearch = useCallback(() => {
    setTerm("");
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((prev) =>
          rows.length === 0 ? -1 : Math.min(prev + 1, rows.length - 1),
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (event.key === "Enter") {
        const target = rows[activeIndex];
        if (target) {
          event.preventDefault();
          router.push(`/employees/${target.id}`);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        clearSearch();
      }
    },
    [rows, activeIndex, router, clearSearch],
  );

  const isBelowMinLength =
    term.trim().length > 0 && term.trim().length < MIN_TERM_LENGTH;

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div>
        <h1 className="text-foreground flex items-center gap-2 text-2xl font-bold tracking-tight">
          <UsersRound className="text-primary h-7 w-7" />
          Employee Directory
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Search the staff register by employee ID or name.{" "}
          <strong className="text-foreground font-semibold">
            {totalEmployees.toLocaleString()}
          </strong>{" "}
          record{totalEmployees === 1 ? "" : "s"} on file.
        </p>
      </div>

      {/* ─── Search hero ─── */}
      <div className="border-border/60 bg-card rounded-2xl border p-4 shadow-sm sm:p-6">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2" />
          <Input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by employee ID (e.g. 00123) or full name…"
            className="h-14 pr-12 pl-12 text-base"
            aria-label="Search employees by ID or name"
            autoFocus
          />
          <div className="absolute top-1/2 right-3 -translate-y-1/2">
            {isLoading ? (
              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
            ) : term ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={clearSearch}
                className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="text-muted-foreground mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5">
            <IdCard className="h-3.5 w-3.5" />
            Matches the employee number or first / last name. Type at least{" "}
            {MIN_TERM_LENGTH} characters.
          </span>
          <span className="hidden items-center gap-3 sm:flex">
            <span>
              <kbd className="bg-muted rounded px-1.5 py-0.5">↑</kbd>
              <kbd className="bg-muted ml-1 rounded px-1.5 py-0.5">↓</kbd>
              <span className="ml-1.5">Navigate</span>
            </span>
            <span>
              <kbd className="bg-muted rounded px-1.5 py-0.5">Enter</kbd>
              <span className="ml-1.5">Open</span>
            </span>
            <span>
              <kbd className="bg-muted rounded px-1.5 py-0.5">Esc</kbd>
              <span className="ml-1.5">Clear</span>
            </span>
          </span>
        </div>
      </div>

      {/* ─── Result summary ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {error ? (
            "Search unavailable"
          ) : isLoading ? (
            "Searching the register…"
          ) : activeTerm ? (
            <>
              <strong className="text-foreground">{total}</strong> match
              {total === 1 ? "" : "es"} for{" "}
              <strong className="text-foreground">“{activeTerm}”</strong>
            </>
          ) : (
            <>
              Showing the first{" "}
              <strong className="text-foreground">{rows.length}</strong> of{" "}
              <strong className="text-foreground">{total}</strong> employees
            </>
          )}
        </p>
        {!isLoading && !error && total > RESULT_LIMIT ? (
          <span className="text-muted-foreground text-xs">
            Refine your search to narrow the list
          </span>
        ) : null}
      </div>

      {/* ─── Results ─── */}
      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive flex items-center justify-between gap-3 rounded-xl border p-4 text-sm"
        >
          <span>{error}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void runSearch(term)}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="border-border/60 bg-card flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
          <div className="bg-muted mb-3 flex h-12 w-12 items-center justify-center rounded-full">
            <Search className="text-muted-foreground h-5 w-5" />
          </div>
          <p className="text-foreground text-sm font-semibold">
            {isBelowMinLength
              ? `Keep typing — at least ${MIN_TERM_LENGTH} characters`
              : activeTerm
                ? `No employees match “${activeTerm}”`
                : "No employee records found"}
          </p>
          <p className="text-muted-foreground mt-1 max-w-md text-xs">
            {activeTerm
              ? "Check the spelling, or try a different employee ID or name."
              : "Once employees are registered they will be searchable here."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row, index) => (
            <li key={row.id}>
              <Link
                id={`employee-result-${index}`}
                href={`/employees/${row.id}`}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "group flex items-center gap-4 rounded-xl border p-3.5 transition-colors sm:p-4",
                  activeIndex === index
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/60 bg-card hover:border-primary/30 hover:bg-muted/40",
                )}
              >
                <div className="bg-primary/10 border-primary/20 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-semibold">
                  {initials(row)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground truncate text-sm font-semibold">
                      {highlight(fullName(row), activeTerm)}
                    </span>
                    <Badge
                      variant={
                        EMPLOYMENT_STATUS_BADGE_VARIANT[row.employmentStatus]
                      }
                      className="text-[10px]"
                    >
                      {labelOrDash(
                        EMPLOYMENT_STATUS_LABELS,
                        row.employmentStatus,
                      )}
                    </Badge>
                    {row.deletedAt ? (
                      <Badge variant="destructive" className="text-[10px]">
                        Archived
                      </Badge>
                    ) : null}
                  </div>

                  <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="bg-muted/50 border-border/50 text-foreground rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium">
                      {highlight(row.employeeNumber, activeTerm)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {row.department?.name ?? "No department"}
                    </span>
                    <span>{labelOrDash(GENDER_LABELS, row.gender)}</span>
                    <span>
                      {labelOrDash(MARITAL_STATUS_LABELS, row.maritalStatus)}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {row.jobGrade != null ? (
                    <Badge
                      variant="secondary"
                      className="hidden font-mono text-xs font-semibold sm:inline-flex"
                    >
                      Grade {row.jobGrade}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-muted-foreground hidden text-[10px] sm:inline-flex"
                    >
                      Grade not set
                    </Badge>
                  )}
                  <ArrowRight className="text-muted-foreground group-hover:text-primary h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
