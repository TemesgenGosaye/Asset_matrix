/**
 * The standard operation catalog — the single place the wording of a success,
 * warning or failure is decided.
 *
 * WHY A CATALOG
 * "Asset created", "Kit created", "Component created" were three separate
 * decisions written at three separate call sites, which is why the app currently
 * says "Deleted successfully" to a user who has no idea what was deleted. When
 * the wording for an operation lives here, every surface that performs that
 * operation reads the same sentence, in both languages, and adding a language
 * means translating this file rather than hunting for string literals.
 *
 * Each entry names an icon and a severity as well as its keys. Those three
 * facts travel together on purpose: an operation that reads as a warning
 * everywhere (a partial import) must not be raised as an error on the page
 * someone happened to write first.
 *
 * Titles and descriptions resolve through `lib/i18n` (`feedback.*`), so this
 * module contains no user-facing prose of its own. Anything that needs wording
 * that is genuinely specific to one screen passes `title`/`description`
 * explicitly to `notify` instead of adding an entry here.
 */

import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  Download,
  FileUp,
  Info,
  ListChecks,
  Lock,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
  Undo2,
  Upload,
  UserCheck,
  UserPlus,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { FeedbackVariant } from "./notify";

export interface FeedbackMessageSpec {
  /** Stable operation id — also the icon key. */
  readonly id: string;
  readonly icon: LucideIcon;
  /** How this operation reads when it succeeds. */
  readonly variant: FeedbackVariant;
  /** i18n key for the bold headline. */
  readonly titleKey: string;
  /**
   * i18n key for the one-line detail.
   *
   * May be absent: some operations are better said in a single line, and a
   * description that only restates the title is noise on a four-second toast.
   */
  readonly descriptionKey?: string;
  /** i18n key for the optional action button. */
  readonly actionKey?: string;
}

/**
 * Build a catalog entry.
 *
 * `variant` defaults to `"success"` because almost every operation in the app
 * succeeds and restating that on every line would bury the handful that do not
 * — which are the ones worth scanning for.
 */
function op(
  id: string,
  icon: LucideIcon,
  titleKey: string,
  options: Partial<
    Pick<FeedbackMessageSpec, "variant" | "descriptionKey" | "actionKey">
  > = {},
): FeedbackMessageSpec {
  return {
    id,
    icon,
    titleKey,
    ...options,
    variant: options.variant ?? "success",
  };
}

/**
 * Standard operations.
 *
 * Grouped by the domain that owns them so a new operation has an obvious home,
 * and so a reader can see at a glance how much of the app's vocabulary is
 * standardised versus still page-specific.
 */
export const FEEDBACK_MESSAGES = {
  // ── Generic CRUD ──────────────────────────────────────────────────────────
  created: op("created", CheckCircle2, "feedback.created.title", {
    variant: "success",
    descriptionKey: "feedback.created.description",
  }),
  updated: op("updated", CheckCircle2, "feedback.updated.title", {
    variant: "success",
    descriptionKey: "feedback.updated.description",
  }),
  deleted: op("deleted", Trash2, "feedback.deleted.title", {
    variant: "success",
    descriptionKey: "feedback.deleted.description",
  }),
  saved: op("saved", CheckCircle2, "feedback.saved.title", {
    variant: "success",
    descriptionKey: "feedback.saved.description",
  }),
  archived: op("archived", ArchiveRestore, "feedback.deleted.title", {
    variant: "success",
    descriptionKey: "feedback.deleted.description",
  }),
  restored: op("restored", RotateCcw, "feedback.saved.title", {
    variant: "success",
    descriptionKey: "feedback.saved.description",
  }),

  // ── House Queue decisions ─────────────────────────────────────────────────
  allocationApproved: op(
    "allocationApproved",
    ShieldCheck,
    "feedback.allocationApproved.title",
    {
      variant: "success",
      descriptionKey: "feedback.allocationApproved.description",
      actionKey: "feedback.allocationApprovedAction",
    },
  ),
  allocationReassigned: op(
    "allocationReassigned",
    UserCheck,
    "feedback.allocationReassigned.title",
    {
      variant: "success",
      descriptionKey: "feedback.allocationReassigned.description",
    },
  ),
  releaseInitiated: op(
    "releaseInitiated",
    ShieldCheck,
    "feedback.releaseInitiated.title",
    {
      variant: "info",
      descriptionKey: "feedback.releaseInitiated.description",
    },
  ),
  releaseExecuted: op(
    "releaseExecuted",
    Undo2,
    "feedback.releaseExecuted.title",
    {
      variant: "success",
      descriptionKey: "feedback.releaseExecuted.description",
      actionKey: "feedback.releaseExecutedAction",
    },
  ),
  transferStarted: op(
    "transferStarted",
    UserCheck,
    "feedback.transferStarted.title",
    {
      variant: "info",
      descriptionKey: "feedback.transferStarted.description",
    },
  ),
  inspectionCompleted: op(
    "inspectionCompleted",
    ListChecks,
    "feedback.inspectionCompleted.title",
    {
      variant: "success",
      descriptionKey: "feedback.inspectionCompleted.description",
    },
  ),
  skipped: op("skipped", Info, "feedback.skipped.title", {
    variant: "info",
    descriptionKey: "feedback.skipped.description",
  }),
  deferred: op("deferred", Info, "feedback.deferred.title", {
    variant: "info",
    descriptionKey: "feedback.deferred.description",
  }),

  // ── Movement ──────────────────────────────────────────────────────────────
  assigned: op("assigned", UserPlus, "feedback.assigned.title", {
    variant: "success",
    descriptionKey: "feedback.assigned.description",
  }),
  returned: op("returned", RotateCcw, "feedback.returned.title", {
    variant: "success",
    descriptionKey: "feedback.returned.description",
  }),

  // ── Documents and data movement ───────────────────────────────────────────
  imported: op("imported", FileUp, "feedback.imported.title", {
    variant: "success",
    descriptionKey: "feedback.imported.description",
  }),
  exported: op("exported", Download, "feedback.exported.title", {
    variant: "success",
    descriptionKey: "feedback.exported.description",
  }),
  uploaded: op("uploaded", Upload, "feedback.uploaded.title", {
    variant: "success",
    descriptionKey: "feedback.uploaded.description",
  }),
  sent: op("sent", Send, "feedback.sent.title", {
    variant: "success",
    descriptionKey: "feedback.sent.description",
  }),

  // ── Account ───────────────────────────────────────────────────────────────
  passwordChanged: op(
    "passwordChanged",
    Lock,
    "feedback.passwordChanged.title",
    {
      variant: "success",
      descriptionKey: "feedback.passwordChanged.description",
    },
  ),
  settingsSaved: op(
    "settingsSaved",
    CheckCircle2,
    "feedback.settingsSaved.title",
    {
      variant: "success",
      descriptionKey: "feedback.settingsSaved.description",
    },
  ),
  loginSuccess: op("loginSuccess", UserCheck, "feedback.loginSuccess.title", {
    variant: "success",
    descriptionKey: "feedback.loginSuccess.description",
  }),

  // ── Failures ──────────────────────────────────────────────────────────────
  failed: op("failed", XCircle, "feedback.error.title", {
    variant: "error",
    descriptionKey: "feedback.error.description",
  }),
  warning: op("warning", AlertTriangle, "feedback.warning.title", {
    variant: "warning",
    descriptionKey: "feedback.warning.description",
  }),
  info: op("info", Info, "feedback.info.title", {
    variant: "info",
    descriptionKey: "feedback.info.description",
  }),
  offline: op("offline", XCircle, "feedback.networkError.title", {
    variant: "error",
    descriptionKey: "feedback.networkError.description",
  }),
} as const satisfies Record<string, FeedbackMessageSpec>;

export type FeedbackOperation = keyof typeof FEEDBACK_MESSAGES;

/**
 * The catalog entry for an operation.
 *
 * Takes the literal key type rather than `string` so a typo is a compile error
 * rather than a toast that renders a raw `feedback.…` key in front of a user.
 */
export function feedbackMessage(
  operation: FeedbackOperation,
): FeedbackMessageSpec {
  return FEEDBACK_MESSAGES[operation];
}
