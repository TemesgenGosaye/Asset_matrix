"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Eye,
  History,
  Info,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { notify } from "@/lib/feedback/notify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  diffSections,
  DEFAULT_ENGINE_CONFIG,
  ENGINE_CONFIG_SECTIONS,
  MCDA_SINGLE_WEIGHT_CAP,
  type EngineConfigPayload,
  type EngineConfigSection,
  type EligibilityBand,
  type McdaWeights,
} from "@/lib/house-queue/config/types";
import {
  validateEligibilityBands,
  validateEngineConfigPayload,
  validateRecommendationRules,
  validateWeights,
  WEIGHT_SUM_EPSILON,
} from "@/lib/house-queue/config/validate";
import { HOUSE_TYPES } from "@/lib/household-constants";
import { HouseCategoryBadge } from "@/ui/household/house-status";
import { fmtScore, fullName } from "@/ui/household/house-format";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

// ---------------------------------------------------------------------------
// DTOs (serialized server state)
// ---------------------------------------------------------------------------

interface ConfigVersionView {
  id: string;
  versionNumber: number;
  status: "draft" | "active" | "archived";
  payload: EngineConfigPayload;
  changeSummary: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  publishedBy: string | null;
  publishedAt: string | null;
  supersededById: string | null;
}

/**
 * What the server says the caller may publish, and what it will demand first.
 *
 * Deliberately NOT re-derived on the client: the publish endpoint diffs the
 * SAVED draft against the active version, while the page also holds unsaved
 * local edits. Deriving it here meant the two could disagree, and the failure
 * mode was a bare `403` with no password field on screen.
 */
interface PublishGateView {
  changedSections: EngineConfigSection[];
  requiresReauth: boolean;
  mfaRequired: boolean;
  hasPublishableChanges: boolean;
}

interface ConfigStateView {
  active: ConfigVersionView;
  draft: ConfigVersionView | null;
  history: ConfigVersionView[];
  editingBase: ConfigVersionView;
  lastAuditAt: string | null;
  lastPublishedAt: string | null;
  lastRunAt: string | null;
  publishGate: PublishGateView;
}

interface PreviewRowView {
  employeeId: string;
  employeeNumber: string;
  firstname: string;
  lastname: string | null;
  jobGrade: number | null;
  houseCategoryCurrent: string | null;
  houseCategoryProposed: string | null;
  mcdScoreCurrent: number | null;
  mcdScoreProposed: number | null;
  priorityRankCurrent: number | null;
  priorityRankProposed: number | null;
  rankDelta: number | null;
  newlyEligible: boolean;
  losesEligibility: boolean;
}

interface PreviewView {
  affectedCount: number;
  newlyEligible: number;
  losesEligibility: number;
  rows: PreviewRowView[];
}

interface AuditEntryView {
  id: string;
  versionId: string;
  versionNumber: number | null;
  fieldPath: string;
  oldValue: string | null;
  newValue: string | null;
  action: string;
  changedBy: string | null;
  changedAt: string;
  ipAddress: string | null;
  changeSummary: string | null;
}

// ---------------------------------------------------------------------------
// Editor model — strings while typing, numeric payload on save/preview
// ---------------------------------------------------------------------------

type WeightKey = keyof McdaWeights;

const WEIGHT_FIELDS: Array<{
  key: WeightKey;
  label: string;
  description: string;
}> = [
  {
    key: "serviceYears",
    label: "Service Years",
    description: "Length of service with the organization.",
  },
  {
    key: "maritalStatus",
    label: "Marital Status",
    description: "Families vs single applicants.",
  },
  {
    key: "disability",
    label: "Disability",
    description: "Applicants with a registered disability.",
  },
  {
    key: "gender",
    label: "Gender",
    description: "Gender balancing within a cohort.",
  },
];

interface BandRowEditor {
  category: string;
  gradeMin: string;
  gradeMax: string;
}

interface EditorsState {
  weights: Record<WeightKey, string>;
  bands: BandRowEditor[];
}

function toNumber(s: string): number {
  return s.trim() === "" ? NaN : Number(s);
}

function parseWeights(form: Record<WeightKey, string>): McdaWeights {
  return {
    serviceYears: toNumber(form.serviceYears),
    maritalStatus: toNumber(form.maritalStatus),
    disability: toNumber(form.disability),
    gender: toNumber(form.gender),
  };
}

function parseBands(rows: BandRowEditor[]): EligibilityBand[] {
  return rows.map((r) => ({
    category: r.category as EligibilityBand["category"],
    gradeMin: toNumber(r.gradeMin),
    gradeMax: r.gradeMax.trim() === "" ? null : toNumber(r.gradeMax),
  }));
}

function editorsFromPayload(p: EngineConfigPayload): EditorsState {
  return {
    weights: {
      serviceYears: String(p.weights.serviceYears),
      maritalStatus: String(p.weights.maritalStatus),
      disability: String(p.weights.disability),
      gender: String(p.weights.gender),
    },
    bands: p.eligibilityBands.map((b) => ({
      category: b.category,
      gradeMin: String(b.gradeMin),
      gradeMax: b.gradeMax === null ? "" : String(b.gradeMax),
    })),
  };
}

const DEFAULT_EDITORS: EditorsState = editorsFromPayload(DEFAULT_ENGINE_CONFIG);

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

function BlastBadge({ radius }: { radius: string }) {
  const styles: Record<string, string> = {
    LOW: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
    HIGH: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    CRITICAL:
      "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  };
  return (
    <Badge variant="outline" className={`gap-1 ${styles[radius] ?? ""}`}>
      <ShieldAlert className="h-3 w-3" />
      {radius}
    </Badge>
  );
}

function ValidationList({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="border-destructive/40 bg-destructive/5 space-y-1 rounded-lg border p-3">
      {errors.map((e) => (
        <p key={e} className="text-destructive flex items-start gap-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {e}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PREVIEW_COLUMNS: Column[] = [
  { key: "employee", label: "Employee", hideable: false },
  { key: "grade", label: "Grade", align: "center" },
  { key: "category", label: "Category", align: "center" },
  { key: "mcd", label: "MCD Score", align: "center" },
  { key: "rank", label: "Rank Delta", align: "center" },
  { key: "eligibility", label: "", align: "center" },
];

export default function EngineConfigClient() {
  const [state, setState] = useState<ConfigStateView | null>(null);
  const [editors, setEditors] = useState<EditorsState>(DEFAULT_EDITORS);
  const [recommendation, setRecommendation] = useState<
    EngineConfigPayload["recommendation"]
  >(DEFAULT_ENGINE_CONFIG.recommendation);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EngineConfigSection>("weights");

  // Preview descriptor
  const [previewData, setPreviewData] = useState<{
    engineA: PreviewView;
    runAt: string;
  } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Publish + identity
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishSummary, setPublishSummary] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [isBackupCode, setIsBackupCode] = useState(false);
  /**
   * Inline identity errors, kept beside the fields rather than only in a toast:
   * a toast disappears, and the user's next action is to retype the password.
   */
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [reauthFieldError, setReauthFieldError] = useState<
    "password" | "totpCode" | null
  >(null);

  // Rollback
  const [rollbackTarget, setRollbackTarget] =
    useState<ConfigVersionView | null>(null);
  const [rollbackSummary, setRollbackSummary] = useState("");

  // Run now + audit
  const [runLoading, setRunLoading] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntryView[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditLoaded, setAuditLoaded] = useState(false);

  // -------------------------------------------------------------------------
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/house-queue/config");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to load engine configuration");
        return;
      }
      const body = (await res.json()) as { state: ConfigStateView };
      setState(body.state);
      setEditors(editorsFromPayload(body.state.editingBase.payload));
      setRecommendation(body.state.editingBase.payload.recommendation);
      setError(null);
    } catch {
      setError("Failed to load engine configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: fetch config state on mount
    void load();
  }, [load]);

  const editingBase = state?.editingBase.payload;
  const active = state?.active;

  // Effective numeric payload built from the string editors.
  const parsedWeights = useMemo(() => parseWeights(editors.weights), [editors]);
  const parsedBands = useMemo(() => parseBands(editors.bands), [editors]);
  const effectiveDraft = useMemo<EngineConfigPayload>(
    () => ({
      weights: parsedWeights,
      eligibilityBands: parsedBands,
      recommendation,
    }),
    [parsedWeights, parsedBands, recommendation],
  );

  const errors = useMemo(
    () => validateEngineConfigPayload(effectiveDraft),
    [effectiveDraft],
  );
  const weightErrors = useMemo(
    () => validateWeights(parsedWeights as unknown as Record<string, unknown>),
    [parsedWeights],
  );
  const bandErrors = useMemo(
    () => validateEligibilityBands(parsedBands),
    [parsedBands],
  );
  const recommendationErrors = useMemo(
    () =>
      validateRecommendationRules(
        recommendation as unknown as Record<string, unknown>,
      ),
    [recommendation],
  );

  const dirtySections = useMemo(() => {
    if (!editingBase) return [];
    return diffSections(editingBase, effectiveDraft);
  }, [editingBase, effectiveDraft]);
  const isDirty = dirtySections.length > 0;

  useUnsavedChanges(isDirty);

  const weightSum = useMemo(
    () =>
      Object.values(parsedWeights).reduce(
        (sum, v) => sum + (Number.isFinite(v) ? v : 0),
        0,
      ),
    [parsedWeights],
  );
  const weightSumOk = Math.abs(weightSum - 1) <= WEIGHT_SUM_EPSILON;
  const weightCapped = useMemo(
    () => Object.values(parsedWeights).some((v) => v > MCDA_SINGLE_WEIGHT_CAP),
    [parsedWeights],
  );

  // -------------------------------------------------------------------------
  // Editor handlers
  // -------------------------------------------------------------------------
  const updateWeight = (key: WeightKey, value: string) => {
    setEditors((prev) => ({
      ...prev,
      weights: { ...prev.weights, [key]: value },
    }));
  };

  const updateBand = (index: number, patch: Partial<BandRowEditor>) => {
    setEditors((prev) => ({
      ...prev,
      bands: prev.bands.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    }));
  };

  const removeBand = (index: number) => {
    setEditors((prev) => ({
      ...prev,
      bands: prev.bands.filter((_, i) => i !== index),
    }));
  };

  const addBand = () => {
    setEditors((prev) => ({
      ...prev,
      bands: [...prev.bands, { category: "E", gradeMin: "", gradeMax: "" }],
    }));
  };

  const discard = () => {
    setEditors(editorsFromPayload(editingBase ?? DEFAULT_ENGINE_CONFIG));
    setRecommendation((editingBase ?? DEFAULT_ENGINE_CONFIG).recommendation);
    setPassword("");
    setTotpCode("");
    notify.info("Discarded unsaved changes");
  };

  // -------------------------------------------------------------------------
  // Remote actions
  // -------------------------------------------------------------------------
  const saveDraft = async () => {
    if (errors.length > 0) {
      notify.error("Fix validation errors before saving the draft");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/house-queue/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: effectiveDraft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.details?.length) notify.error(body.details[0]);
        else notify.error(body.error ?? "Failed to save the draft");
        return;
      }
      setState(body.state);
      notify.success("Draft saved");
    } catch {
      notify.error("Failed to save the draft");
    } finally {
      setSaving(false);
    }
  };

  const previewImpact = async () => {
    if (errors.length > 0) {
      notify.error("Fix validation errors before previewing");
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/house-queue/config/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: effectiveDraft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(body.error ?? "Failed to compute the preview");
        return;
      }
      setPreviewData({
        engineA: body.engineA as PreviewView,
        runAt: new Date().toISOString(),
      });
      setPreviewOpen(true);
    } catch {
      notify.error("Failed to compute the preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const postReauth = async () => {
    const res = await fetch("/api/house-queue/config/reauth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        ...(totpCode.trim() ? { totpCode: totpCode.trim(), isBackupCode } : {}),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Shown against the field the server blamed, not only as a toast, so a
      // rejected code is attached to the code box and a rejected password to
      // the password box.
      const field = body.field === "totpCode" ? "totpCode" : "password";
      setReauthError(body.error ?? "Identity verification failed");
      setReauthFieldError(field);
      if (field === "password") setPassword("");
      return false;
    }
    setReauthError(null);
    setReauthFieldError(null);
    return true;
  };

  const publishDraft = async () => {
    const changed = editingBase
      ? diffSections(editingBase, effectiveDraft)
      : [];
    if (changed.length === 0) {
      notify.info("Nothing to publish — the draft matches the live configuration");
      setPublishOpen(false);
      return;
    }
    // Unsaved edits are invisible to the publish endpoint, which reads the
    // saved draft. Publishing while `isDirty` silently drops them, so the user
    // is told to save first.
    if (isDirty) {
      notify.error({
      title: "Save the draft before publishing",
      description: "Publishing promotes the saved draft. Unsaved edits would not be included.",
    });
      return;
    }
    setPublishLoading(true);
    try {
      if (needsReauthPublish) {
        const ok = await postReauth();
        if (!ok) return;
      }
      const res = await fetch("/api/house-queue/config/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeSummary: publishSummary.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(body.error ?? "Failed to publish the configuration");
        // The endpoint ships its gate with the rejection. Adopt it so the
        // identity prompt appears, instead of the user retrying into the same
        // 403.
        if (body.publishGate) {
          setState((prev) =>
            prev ? { ...prev, publishGate: body.publishGate } : prev,
          );
          setReauthError(
            "Your identity must be confirmed before this change can be published.",
          );
        }
        return;
      }
      setState(body.state);
      setPublishOpen(false);
      setPublishSummary("");
      setPassword("");
      setTotpCode("");
      setReauthError(null);
      notify.success("Configuration published");
    } catch {
      notify.error("Failed to publish the configuration");
    } finally {
      setPublishLoading(false);
    }
  };

  const rollback = async () => {
    if (!rollbackTarget) return;
    setPublishLoading(true);
    try {
      const ok = await postReauth();
      if (!ok) return;
      const res = await fetch("/api/house-queue/config/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetVersionId: rollbackTarget.id,
          changeSummary: rollbackSummary.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(body.error ?? "Failed to roll back the configuration");
        return;
      }
      setState(body.state);
      setRollbackTarget(null);
      setRollbackSummary("");
      setPassword("");
      setTotpCode("");
      notify.success("Configuration rolled back to v" + rollbackTarget.versionNumber);
    } catch {
      notify.error("Failed to roll back the configuration");
    } finally {
      setPublishLoading(false);
    }
  };

  const runNow = async () => {
    setRunLoading(true);
    try {
      const res = await fetch("/api/house-queue/config/run", {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(body.error ?? "Failed to run the engine");
        return;
      }
      notify.success("House queue engine run recorded");
      void load();
    } catch {
      notify.error("Failed to run the house queue engine");
    } finally {
      setRunLoading(false);
    }
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const res = await fetch("/api/house-queue/config/audit?limit=100");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(body.error ?? "Failed to load the audit trail");
        return;
      }
      setAuditEntries(body.entries ?? []);
      setAuditLoaded(true);
    } catch {
      notify.error("Failed to load the audit trail");
    } finally {
      setAuditLoading(false);
    }
  };

  /**
   * Whether publishing the SAVED draft will demand a password.
   *
   * Read from the server rather than derived from local edits. The old version
   * diffed `editors`/`recommendation` — unsaved local state — while
   * `POST /publish` diffs the saved draft, so the two could disagree and the
   * publish would come back `403 REAUTH_REQUIRED` with no way for the user to
   * satisfy it.
   */
  const needsReauthPublish = state?.publishGate.requiresReauth ?? false;

  /**
   * Whether the second-factor field is mandatory.
   *
   * The re-auth endpoint demands a code whenever the account has MFA enabled,
   * and this used to be hard-labelled "(optional)", which sent the user into a
   * guaranteed `400`.
   */
  const mfaRequired = state?.publishGate.mfaRequired ?? false;

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------
  const renderIdentity = () => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="cfg-reauth-password">
          Password <span className="text-muted-foreground">(required)</span>
        </Label>
        <Input
          id="cfg-reauth-password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (reauthFieldError === "password") setReauthFieldError(null);
          }}
          aria-invalid={reauthFieldError === "password"}
          placeholder="Re-enter your password"
          className={
            reauthFieldError === "password" ? "border-destructive" : ""
          }
        />
        {reauthFieldError === "password" && reauthError && (
          <p role="alert" className="text-destructive text-xs">
            {reauthError}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cfg-reauth-totp">
          Two-factor code{" "}
          {/*
            Labelled from the server's answer, not a guess. The re-auth endpoint
            rejects a code-less request whenever MFA is on, so calling this
            "optional" guaranteed a 400 for exactly the users who needed it.
          */}
          {mfaRequired ? (
            <span className="text-destructive">(required)</span>
          ) : (
            <span className="text-muted-foreground">
              (optional — not enabled on your account)
            </span>
          )}
        </Label>
        <Input
          id="cfg-reauth-totp"
          value={totpCode}
          onChange={(e) => {
            setTotpCode(e.target.value);
            if (reauthFieldError === "totpCode") setReauthFieldError(null);
          }}
          aria-invalid={reauthFieldError === "totpCode"}
          placeholder="TOTP or backup code"
          className={
            reauthFieldError === "totpCode" ? "border-destructive" : ""
          }
        />
        {reauthFieldError === "totpCode" && reauthError && (
          <p role="alert" className="text-destructive text-xs">
            {reauthError}
          </p>
        )}
        <label className="text-muted-foreground flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={isBackupCode}
            onChange={(e) => setIsBackupCode(e.target.checked)}
          />
          Use a backup code
        </label>
      </div>
    </div>
  );

  const renderPreviewCell = useCallback((row: PreviewRowView, key: string) => {
    switch (key) {
      case "employee":
        return (
          <div>
            <div className="font-medium">{fullName(row)}</div>
            <div className="text-muted-foreground text-xs">
              {row.employeeNumber}
            </div>
          </div>
        );
      case "grade":
        return row.jobGrade != null ? (
          <span className="font-semibold tabular-nums">{row.jobGrade}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      case "category":
        return (
          <div className="flex items-center justify-center gap-1.5">
            <HouseCategoryBadge category={row.houseCategoryCurrent} />
            <ArrowRight className="text-muted-foreground h-3 w-3" />
            <HouseCategoryBadge category={row.houseCategoryProposed} />
          </div>
        );
      case "mcd":
        return (
          <div className="tabular-nums">
            <span>{fmtScore(row.mcdScoreCurrent)}</span>
            {" → "}
            <span
              className={
                row.mcdScoreProposed !== row.mcdScoreCurrent
                  ? "font-semibold"
                  : ""
              }
            >
              {fmtScore(row.mcdScoreProposed)}
            </span>
          </div>
        );
      case "rank":
        return row.rankDelta === null || row.rankDelta === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : row.rankDelta > 0 ? (
          <Badge variant="secondary" className="gap-1 text-emerald-600">
            <ArrowUp className="h-3 w-3" />+{row.rankDelta}
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1 text-rose-600">
            <ArrowDown className="h-3 w-3" />
            {row.rankDelta}
          </Badge>
        );
      case "eligibility":
        if (row.newlyEligible)
          return (
            <Badge className="bg-emerald-600 text-white">Newly eligible</Badge>
          );
        if (row.losesEligibility)
          return <Badge variant="destructive">Loses eligibility</Badge>;
        return null;
      default:
        return null;
    }
  }, []);

  if (loading) {
    return (
      <div className="bg-card flex items-center justify-center rounded-xl border p-16">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !state || !editingBase) {
    return (
      <div className="bg-card rounded-xl border p-12 text-center">
        <h2 className="text-foreground text-sm font-semibold">
          Could not load configuration
        </h2>
        <p className="text-muted-foreground mx-auto mt-1 max-w-md text-xs">
          {error ?? "The engine configuration is unavailable."}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void load()}
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  const changedMeta = dirtySections.map((s) =>
    ENGINE_CONFIG_SECTIONS.find((m) => m.key === s)!,
  );

  /**
   * The sections the saved draft would actually publish.
   *
   * Deliberately not `changedMeta`: that describes unsaved local edits, which
   * are not what goes live. The publish dialog used to list the local set, so it
   * could promise a change that was never going to be published.
   */
  const publishChangedMeta = (state?.publishGate.changedSections ?? []).map(
    (s) => ENGINE_CONFIG_SECTIONS.find((m) => m.key === s)!,
  );

  return (
    <div className="space-y-6 pb-16">
      {/* ─── Heading ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Engine Configuration
          </h1>
          <p className="text-muted-foreground text-sm">
            Tune how the house queue ranks and recommends. Changes are drafted,
            previewed and published — never applied silently.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runNow()}
            disabled={runLoading}
          >
            <Play className="h-4 w-4" />
            Run Now
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ─── Status banner ─── */}
      <div className="bg-card flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 shadow-sm">
        <Badge variant="outline" className="gap-1.5">
          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          Active v{active?.versionNumber}
        </Badge>
        {state.draft ? (
          <Badge className="gap-1.5 bg-amber-500 text-white">
            <Save className="h-3 w-3" />
            Draft v{state.draft.versionNumber}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">No draft</span>
        )}
        <span className="text-muted-foreground text-xs">
          Last published: {fmtTime(state.lastPublishedAt)}
        </span>
        <span className="text-muted-foreground text-xs">
          Last run: {fmtTime(state.lastRunAt)}
        </span>

        {/*
          The saved draft's own publish action.

          This used to live only inside the "Unsaved changes" footer, which made
          it unreachable in the one case that matters most: a draft that was
          saved, differs from the active version, and therefore can and should
          be published — but has no unsaved edits, so the footer never rendered.
          The gate comes from the server, so this button appears exactly when
          `POST /publish` would accept the request.
        */}
        {state.publishGate.hasPublishableChanges && (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => {
              setReauthError(null);
              setReauthFieldError(null);
              setPublishOpen(true);
            }}
            disabled={isDirty}
            title={
              isDirty ? "Save or discard your unsaved changes first" : undefined
            }
          >
            {state.publishGate.requiresReauth && (
              <ShieldAlert className="h-4 w-4" />
            )}
            Publish Draft v{state.draft?.versionNumber}
          </Button>
        )}
      </div>

      {/*
        A saved draft is waiting to go live but the page has unsaved edits on
        top of it. Publishing now would promote the saved draft and silently
        drop the edits, so say so rather than letting the user discover it.
      */}
      {isDirty && state.publishGate.hasPublishableChanges && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            The saved draft has changes waiting to be published, and you also
            have unsaved edits on this page. Save or discard your edits first —
            publishing promotes the saved draft only.
          </div>
        </div>
      )}

      {/* ─── Section tabs ─── */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as EngineConfigSection)}
      >
        <TabsList>
          {ENGINE_CONFIG_SECTIONS.map((m) => (
            <TabsTrigger key={m.key} value={m.key} className="gap-2">
              {m.label}
              {dirtySections.includes(m.key) && (
                <span className="h-2 w-2 rounded-full bg-amber-500" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* MCDA weights */}
        <TabsContent value="weights">
          <Card>
            <CardHeader>
              <CardTitle>MCDA Weights</CardTitle>
              <CardDescription>
                Criterion weights for Engine A priority scoring. Weights apply
                to every active cohort — a high blast-radius change.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {WEIGHT_FIELDS.map((f) => (
                  <div
                    key={f.key}
                    className="bg-muted/30 space-y-2 rounded-lg border p-4"
                  >
                    <Label htmlFor={`weight-${f.key}`}>{f.label}</Label>
                    <p className="text-muted-foreground text-xs">
                      {f.description}
                    </p>
                    <Input
                      id={`weight-${f.key}`}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      max="1"
                      value={editors.weights[f.key]}
                      onChange={(e) => updateWeight(f.key, e.target.value)}
                    />
                  </div>
                ))}
              </div>

              <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3">
                <span className="text-sm font-medium">Sum of weights</span>
                <Badge
                  variant={weightSumOk ? "secondary" : "destructive"}
                  className="tabular-nums"
                >
                  {weightSumOk ? weightSum.toFixed(3) : weightSum.toFixed(3)}
                </Badge>
                {!weightSumOk && (
                  <span className="text-destructive text-xs">
                    Must total 1 (±{WEIGHT_SUM_EPSILON})
                  </span>
                )}
                {weightCapped && (
                  <span className="text-xs text-amber-600">
                    A single weight exceeds {MCDA_SINGLE_WEIGHT_CAP} — requires
                    a policy override + reason.
                  </span>
                )}
              </div>

              <ValidationList errors={weightErrors} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Eligibility bands */}
        <TabsContent value="eligibilityBands">
          <Card>
            <CardHeader>
              <CardTitle>Eligibility Bands</CardTitle>
              <CardDescription>
                Job grade → house category mapping. Bands must be contiguous and
                non-overlapping across grades 1–17+.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>House Category</TableHead>
                      <TableHead>Min Grade</TableHead>
                      <TableHead>Max Grade</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editors.bands.map((band, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Select
                            value={band.category}
                            onValueChange={(v) =>
                              updateBand(i, { category: v })
                            }
                          >
                            <SelectTrigger className="w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {HOUSE_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {t}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            value={band.gradeMin}
                            onChange={(e) =>
                              updateBand(i, { gradeMin: e.target.value })
                            }
                            placeholder="e.g. 12"
                            className="w-28"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            value={band.gradeMax}
                            onChange={(e) =>
                              updateBand(i, { gradeMax: e.target.value })
                            }
                            placeholder="blank = unbounded (18+)"
                            className="w-44"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive h-8 w-8 p-0"
                            onClick={() => removeBand(i)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Remove band</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3">
                <Button variant="outline" size="sm" onClick={addBand}>
                  <Plus className="h-4 w-4" /> Add band
                </Button>
                <p className="bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-lg border px-3 py-2 text-xs">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Job grade 0/unset is never eligible for a house — this is a
                  system invariant and cannot be configured.
                </p>
                <ValidationList errors={bandErrors} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recommendation rules */}
        <TabsContent value="recommendation">
          <Card>
            <CardHeader>
              <CardTitle>Recommendation Rules</CardTitle>
              <CardDescription>
                Engine B ordering preferences within an already-eligible pool.
                Low blast radius — no impact preview or re-auth required to
                publish.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-muted/30 flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label>Prefer regular houses over guest houses</Label>
                  <p className="text-muted-foreground text-xs">
                    When both are available for the same category.
                  </p>
                </div>
                <Switch
                  checked={recommendation.preferRegularOverGuest}
                  onCheckedChange={(v) =>
                    setRecommendation((prev) => ({
                      ...prev,
                      preferRegularOverGuest: v,
                    }))
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Location sort direction</Label>
                  <Select
                    value={recommendation.locationSortDirection}
                    onValueChange={(v) =>
                      setRecommendation((prev) => ({
                        ...prev,
                        locationSortDirection: v as "asc" | "desc",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending (A → Z)</SelectItem>
                      <SelectItem value="desc">Descending (Z → A)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>House number sort mode</Label>
                  <Select
                    value={recommendation.houseNumberSortMode}
                    onValueChange={(v) =>
                      setRecommendation((prev) => ({
                        ...prev,
                        houseNumberSortMode: v as "numeric_aware" | "lexical",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="numeric_aware">
                        Numeric-aware (12 &lt; 120)
                      </SelectItem>
                      <SelectItem value="lexical">
                        Lexical (alphabetical)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <ValidationList errors={recommendationErrors} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Overall validation banner ─── */}
      {errors.length > 0 && (
        <div className="border-destructive/40 bg-destructive/5 rounded-xl border p-4">
          <ValidationList errors={errors} />
        </div>
      )}

      {/* ─── Sticky unsaved-changes footer ─── */}
      {isDirty && (
        <div className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 px-4 py-3">
            <span className="text-sm font-medium">
              Unsaved changes in {changedMeta.map((m) => m.label).join(", ")}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={discard}>
                Discard
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void saveDraft()}
                disabled={saving}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                <Save className="h-4 w-4" />
                Save Draft
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void previewImpact()}
                disabled={previewLoading}
              >
                <Eye className="h-4 w-4" />
                Preview
              </Button>
              {/*
                No Publish button here. Publishing promoted the SAVED draft, so
                offering it next to unsaved edits invited a publish that
                silently dropped them. The status banner owns the single publish
                entry point, gated on the server's own view of the draft.
              */}
            </div>
          </div>
        </div>
      )}

      {/* ─── History + audit ─── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Version history */}
        <Card>
          <CardHeader>
            <CardTitle>Version History</CardTitle>
            <CardDescription>
              Archived versions are soft-retained so any stage can be rolled
              back.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[active, state.draft, ...state.history]
              .filter((v): v is ConfigVersionView => Boolean(v))
              .map((v) => (
                <div
                  key={v.id}
                  className="bg-muted/30 flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">v{v.versionNumber}</span>
                      <Badge
                        variant={
                          v.status === "active"
                            ? "default"
                            : v.status === "draft"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {v.status}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {v.changeSummary ?? "No summary"}
                      {v.publishedAt &&
                        ` · published ${fmtTime(v.publishedAt)}`}
                    </p>
                  </div>
                  {v.status === "archived" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRollbackTarget(v);
                        setPassword("");
                        setTotpCode("");
                      }}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Rollback
                    </Button>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>

        {/* Audit trail */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Audit Trail</CardTitle>
                <CardDescription>
                  Field-level config audit, newest first.
                </CardDescription>
              </div>
              {!auditLoaded && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadAudit()}
                  disabled={auditLoading}
                >
                  <History className="h-4 w-4" />
                  Load audit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!auditLoaded ? (
              <p className="text-muted-foreground text-xs">
                Click “Load audit” to fetch the last 100 config changes.
              </p>
            ) : auditEntries.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No config changes recorded yet.
              </p>
            ) : (
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {auditEntries.map((e) => (
                  <div
                    key={e.id}
                    className="bg-muted/30 rounded-lg border px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {e.action}
                      </Badge>
                      <span className="text-xs font-medium">
                        v{e.versionNumber}
                      </span>
                      <span className="text-muted-foreground text-[11px]">
                        {fmtTime(e.changedAt)}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px]">{e.fieldPath}</p>
                    {e.oldValue !== null && (
                      <p className="text-muted-foreground mt-1 text-[11px] break-all">
                        <span className="text-rose-600 line-through">
                          {e.oldValue}
                        </span>
                        {" → "}
                        <span className="text-emerald-600">{e.newValue}</span>
                      </p>
                    )}
                    {e.changeSummary && (
                      <p className="text-muted-foreground mt-1 text-[11px]">
                        {e.changeSummary}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Preview dialog ─── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Impact Preview</DialogTitle>
            <DialogDescription>
              Re-runs the queue once more with your proposed draft and diffs it
              against the live configuration
              {previewData && ` (${fmtTime(previewData.runAt)})`}.
            </DialogDescription>
          </DialogHeader>
          {previewData && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/40 rounded-lg border p-3 text-center">
                  <div className="text-2xl font-bold tabular-nums">
                    {previewData.engineA.affectedCount}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Rows affected
                  </div>
                </div>
                <div className="bg-muted/40 rounded-lg border p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-600 tabular-nums">
                    {previewData.engineA.newlyEligible}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Newly eligible
                  </div>
                </div>
                <div className="bg-muted/40 rounded-lg border p-3 text-center">
                  <div className="text-2xl font-bold text-rose-600 tabular-nums">
                    {previewData.engineA.losesEligibility}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Lose eligibility
                  </div>
                </div>
              </div>
              {previewData.engineA.rows.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  No deterministic engine output changes for this draft.
                </p>
              ) : (
                <ResponsiveTable
                  columns={PREVIEW_COLUMNS}
                  data={previewData.engineA.rows}
                  renderCell={renderPreviewCell}
                  keyExtractor={(r) => r.employeeId}
                  mobileCardView
                  minWidth="760px"
                  emptyMessage="No affected rows"
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Publish dialog ─── */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish Configuration</DialogTitle>
            <DialogDescription>
              {needsReauthPublish
                ? "This draft changes weights or eligibility bands and requires you to re-confirm your identity."
                : "Confirm the draft becomes the live configuration."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              {/*
                The sections being published are the SAVED draft's, not the
                local dirty set. Listing the latter here would describe a change
                that is not the one about to go live.
              */}
              {publishChangedMeta.map((m) => (
                <div
                  key={m.key}
                  className="bg-muted/40 flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div>
                    <span className="text-sm font-medium">{m.label}</span>
                    <p className="text-muted-foreground text-xs">
                      {m.description}
                    </p>
                  </div>
                  <BlastBadge radius={m.blastRadius} />
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-publish-summary">Change summary</Label>
              <Textarea
                id="cfg-publish-summary"
                value={publishSummary}
                onChange={(e) => setPublishSummary(e.target.value)}
                placeholder="What changed and why (recorded in the audit trail)"
                rows={2}
              />
            </div>
            {needsReauthPublish && renderIdentity()}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPublishOpen(false)}
              disabled={publishLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void publishDraft()}
              disabled={publishLoading}
            >
              {publishLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Rollback dialog ─── */}
      <Dialog
        open={rollbackTarget !== null}
        onOpenChange={(o) => !o && setRollbackTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Rollback to v{rollbackTarget?.versionNumber}
            </DialogTitle>
            <DialogDescription>
              Re-publishes the archived v{rollbackTarget?.versionNumber} payload
              as a new version. Requires re-confirmation of your identity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-rollback-summary">Change summary</Label>
              <Textarea
                id="cfg-rollback-summary"
                value={rollbackSummary}
                onChange={(e) => setRollbackSummary(e.target.value)}
                placeholder="Reason for the rollback (required)"
                rows={2}
              />
            </div>
            {renderIdentity()}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRollbackTarget(null)}
              disabled={publishLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void rollback()}
              disabled={publishLoading}
            >
              {publishLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Rollback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
