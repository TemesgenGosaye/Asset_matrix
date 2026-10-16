"use client";

/**
 * Create / edit a renter.
 *
 * Form-in-Dialog with manual state + the module's Zod schema for validation,
 * mirroring `EmployeeFormModal`. Client-side validation is the SAME schema the
 * API runs, so the user gets a field-level message instead of a 422 round trip,
 * while the server still validates independently.
 *
 * Notes on behaviour:
 *   * "Other" reveals a required "Describe rent type" field.
 *   * Phones are a multi-entry list (1-3), exactly one marked primary.
 *   * On create the lease term defaults to 24 months and the start date to today.
 *   * On edit the start date / term fields are disabled when payments already
 *     exist, and the reason field appears instead - the server enforces the same
 *     rule independently.
 */

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RENT_GENDER_OPTIONS,
  RENT_TYPE_OPTIONS,
  TERM_MONTHS_DEFAULT,
  TERM_MONTHS_MAX,
  TERM_MONTHS_MIN,
} from "@/lib/rent/constants";
import { createRenterSchema, updateRenterSchema } from "@/lib/rent/schemas";
import {
  todayDateOnly,
  type RentFormValues,
  type RentRenterDto,
} from "@/lib/rent/types";

interface RenterFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null = create mode. */
  renter?: RentRenterDto | null;
  /** True when the lease already has payments (blocks schedule edits). */
  hasPayments?: boolean;
  /** True when the user holds `rent:override_terms`. */
  canOverrideTerms?: boolean;
  onSaved: (result: { id: string }) => Promise<void> | void;
}

type FieldErrors = Record<string, string>;

function emptyForm(): RentFormValues {
  return {
    firstName: "",
    lastName: "",
    gender: "",
    nationalId: "",
    phones: [{ phone: "", isPrimary: true }],
    rentType: "Shop",
    rentTypeDetail: "",
    monthlyPrice: "",
    startDate: todayDateOnly(),
    termMonths: String(TERM_MONTHS_DEFAULT),
  };
}

function formFromRenter(renter: RentRenterDto): RentFormValues {
  return {
    firstName: renter.firstName,
    lastName: renter.lastName,
    gender: renter.gender,
    nationalId: renter.nationalId,
    phones:
      renter.phones.length > 0
        ? renter.phones.map((p) => ({ phone: p.phone, isPrimary: p.isPrimary }))
        : [{ phone: "", isPrimary: true }],
    rentType: renter.rentType,
    rentTypeDetail: renter.rentTypeDetail ?? "",
    monthlyPrice: renter.monthlyPrice,
    startDate: renter.startDate,
    termMonths: String(renter.termMonths),
  };
}

function RenterFormFields({
  renter,
  hasPayments,
  canOverrideTerms,
  onSaved,
  onCancel,
}: {
  renter: RentRenterDto | null;
  hasPayments: boolean;
  canOverrideTerms: boolean;
  onSaved: (result: { id: string }) => Promise<void> | void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(renter);
  // Lazy initialisers: this component is mounted fresh each time the dialog
  // opens, so the form starts from the renter's values (or a blank create form)
  // with no reset effect and no extra render on open.
  const [values, setValues] = useState<RentFormValues>(() =>
    renter ? formFromRenter(renter) : emptyForm(),
  );
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const formId = useId();

  const setField = useCallback(
    <K extends keyof RentFormValues>(key: K, value: RentFormValues[K]) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      setFieldErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  const showOtherDetail = values.rentType === "Other";

  /** Map Zod issues onto `{ field: message }`, flattening array paths. */
  const collectErrors = useCallback(
    (issues: { path: PropertyKey[]; message: string }[]) => {
      const next: FieldErrors = {};
      for (const issue of issues) {
        const key = issue.path
          .map((p) => (typeof p === "number" ? "phones" : String(p)))
          .join(".");
        if (!next[key]) next[key] = issue.message;
      }
      return next;
    },
    [],
  );

  const submit = useCallback(async () => {
    if (isSaving) return;
    setFormError(null);
    setFieldErrors({});

    const payload = {
      firstName: values.firstName,
      lastName: values.lastName,
      gender: values.gender,
      nationalId: values.nationalId,
      phones: values.phones,
      rentType: values.rentType,
      rentTypeDetail: values.rentTypeDetail,
      monthlyPrice: values.monthlyPrice,
      startDate: values.startDate,
      termMonths: values.termMonths,
      ...(isEdit && reason.trim() ? { reason: reason.trim() } : {}),
    };

    // Validate with the same schema the API uses. The update schema is a partial
    // document, so the whole payload is still valid for it.
    const schema = isEdit ? updateRenterSchema : createRenterSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setFieldErrors(collectErrors(parsed.error.issues));
      setFormError("Please correct the highlighted fields.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(
        isEdit ? `/api/rent/${renter!.id}` : "/api/rent",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Prefer the server's field-level detail when it supplied any, but map
        // paths the same way `collectErrors` does: the server reports
        // "phones.0" and every render site reads `fieldErrors["phones"]`, so an
        // unmapped key would silently show nothing at all.
        const details = Array.isArray(body?.details) ? body.details : [];
        const mapped: FieldErrors = {};
        for (const d of details) {
          const key = String(d?.field ?? "")
            .split(".")
            .map((part) =>
              part !== "" && !Number.isNaN(Number(part)) ? "phones" : part,
            )
            .filter((part) => part !== "")
            .join(".");
          if (key && !mapped[key]) mapped[key] = String(d?.message ?? "");
        }
        setFieldErrors(mapped);
        // Always show the banner as well: an unmapped field, or an error the
        // server described without field detail, must never be a silent no-op.
        setFormError(
          mapped && Object.keys(mapped).length > 0
            ? String(body?.error ?? "Please correct the highlighted fields.")
            : String(body?.error ?? "The renter could not be saved."),
        );
        return;
      }

      await onSaved({ id: renter?.id ?? body?.renter?.id ?? "" });
      onCancel();
    } catch {
      setFormError(
        "Could not reach the server. Check your connection and retry.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    collectErrors,
    isEdit,
    isSaving,
    onCancel,
    onSaved,
    reason,
    renter,
    values,
  ]);

  /**
   * The schedule is locked as soon as any payment exists, regardless of
   * `canOverrideTerms`: the service refuses to regenerate it unconditionally
   * (`SCHEDULE_FROZEN`), because re-dating the schedule would re-date already
   * issued receipts. Unlocking the inputs for an override holder only produced
   * a guaranteed 409, so the controls stay disabled and the reason is stated.
   */
  const scheduleLocked = Boolean(isEdit && hasPayments);

  const phonesDisabled = values.phones.length >= 3;

  const termHint = useMemo(
    () => `${TERM_MONTHS_MIN}-${TERM_MONTHS_MAX} months`,
    [],
  );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-6"
    >
      {formError ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm"
        >
          {formError}
        </div>
      ) : null}

      {/* ---- Personal details ---- */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Personal Details</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-firstName`}>First name</Label>
            <Input
              id={`${formId}-firstName`}
              ref={firstFieldRef}
              value={values.firstName}
              onChange={(e) => setField("firstName", e.target.value)}
              aria-invalid={Boolean(fieldErrors.firstName)}
              aria-describedby={
                fieldErrors.firstName ? `${formId}-firstName-err` : undefined
              }
              maxLength={50}
              required
            />
            {fieldErrors.firstName ? (
              <p
                id={`${formId}-firstName-err`}
                className="text-destructive text-xs"
              >
                {fieldErrors.firstName}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${formId}-lastName`}>Last name</Label>
            <Input
              id={`${formId}-lastName`}
              value={values.lastName}
              onChange={(e) => setField("lastName", e.target.value)}
              aria-invalid={Boolean(fieldErrors.lastName)}
              aria-describedby={
                fieldErrors.lastName ? `${formId}-lastName-err` : undefined
              }
              maxLength={50}
              required
            />
            {fieldErrors.lastName ? (
              <p
                id={`${formId}-lastName-err`}
                className="text-destructive text-xs"
              >
                {fieldErrors.lastName}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-gender`}>Gender</Label>
            <Select
              value={values.gender}
              onValueChange={(v) => setField("gender", v)}
            >
              <SelectTrigger
                id={`${formId}-gender`}
                aria-invalid={Boolean(fieldErrors.gender)}
                aria-describedby={
                  fieldErrors.gender ? `${formId}-gender-err` : undefined
                }
              >
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                {RENT_GENDER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.gender ? (
              <p
                id={`${formId}-gender-err`}
                className="text-destructive text-xs"
              >
                {fieldErrors.gender}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${formId}-nationalId`}>National ID</Label>
            <Input
              id={`${formId}-nationalId`}
              value={values.nationalId}
              onChange={(e) =>
                setField("nationalId", e.target.value.replace(/[^\d]/g, ""))
              }
              inputMode="numeric"
              placeholder="Digits only"
              aria-invalid={Boolean(fieldErrors.nationalId)}
              aria-describedby={
                fieldErrors.nationalId ? `${formId}-nationalId-err` : undefined
              }
              required
            />
            {fieldErrors.nationalId ? (
              <p
                id={`${formId}-nationalId-err`}
                className="text-destructive text-xs"
              >
                {fieldErrors.nationalId}
              </p>
            ) : null}
          </div>
        </div>

        {/* ---- Phones ---- */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            {/* Labels the group rather than a single input: there is no one
                    control to point `htmlFor` at. */}
            <Label id={`${formId}-phones-label`}>Phone numbers</Label>
            <span className="text-muted-foreground text-xs">
              1-3 numbers, one primary
            </span>
          </div>

          {values.phones.map((entry, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Input
                    value={entry.phone}
                    onChange={(e) => {
                      const next = [...values.phones];
                      next[index] = { ...next[index], phone: e.target.value };
                      setField("phones", next);
                    }}
                    placeholder="0912345678 or +251 912345678"
                    inputMode="tel"
                    aria-label={`Phone number ${index + 1}`}
                    aria-invalid={Boolean(fieldErrors["phones"])}
                    aria-describedby={
                      fieldErrors["phones"] ? `${formId}-phones-err` : undefined
                    }
                  />
                  <label className="flex shrink-0 items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={entry.isPrimary}
                      onCheckedChange={(checked) => {
                        const next = values.phones.map((p, i) =>
                          i === index
                            ? { ...p, isPrimary: checked === true }
                            : { ...p, isPrimary: false },
                        );
                        setField("phones", next);
                      }}
                      aria-label={`Mark phone ${index + 1} as primary`}
                    />
                    Primary
                  </label>
                </div>
                {fieldErrors["phones"] ? (
                  <p
                    id={`${formId}-phones-err`}
                    className="text-destructive text-xs"
                  >
                    {fieldErrors["phones"]}
                  </p>
                ) : null}
              </div>

              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive h-9 w-9"
                disabled={values.phones.length <= 1}
                onClick={() =>
                  setField(
                    "phones",
                    values.phones.filter((_, i) => i !== index),
                  )
                }
                aria-label={`Remove phone number ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={phonesDisabled}
            onClick={() =>
              setField("phones", [
                ...values.phones,
                { phone: "", isPrimary: values.phones.length === 0 },
              ])
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Add phone
          </Button>
          {phonesDisabled ? (
            <p className="text-muted-foreground text-xs">
              Maximum of 3 phone numbers.
            </p>
          ) : null}
        </div>
      </fieldset>

      {/* ---- Lease terms ---- */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Lease Terms</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-rentType`}>Rent type</Label>
            <Select
              value={values.rentType}
              onValueChange={(v) => setField("rentType", v)}
            >
              <SelectTrigger id={`${formId}-rentType`}>
                <SelectValue placeholder="Select rent type" />
              </SelectTrigger>
              <SelectContent>
                {RENT_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showOtherDetail ? (
            <div className="space-y-2">
              <Label htmlFor={`${formId}-rentTypeDetail`}>
                Describe rent type <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${formId}-rentTypeDetail`}
                value={values.rentTypeDetail}
                onChange={(e) => setField("rentTypeDetail", e.target.value)}
                placeholder="e.g. Restaurant, Office space"
                aria-invalid={Boolean(fieldErrors.rentTypeDetail)}
                aria-describedby={
                  fieldErrors.rentTypeDetail
                    ? `${formId}-rentTypeDetail-err`
                    : undefined
                }
                maxLength={200}
                required
              />
              {fieldErrors.rentTypeDetail ? (
                <p
                  id={`${formId}-rentTypeDetail-err`}
                  className="text-destructive text-xs"
                >
                  {fieldErrors.rentTypeDetail}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-monthlyPrice`}>
              Monthly price (ETB) <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${formId}-monthlyPrice`}
              value={values.monthlyPrice}
              onChange={(e) => setField("monthlyPrice", e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              aria-invalid={Boolean(fieldErrors.monthlyPrice)}
              aria-describedby={
                fieldErrors.monthlyPrice
                  ? `${formId}-monthlyPrice-err`
                  : undefined
              }
              required
            />
            {fieldErrors.monthlyPrice ? (
              <p
                id={`${formId}-monthlyPrice-err`}
                className="text-destructive text-xs"
              >
                {fieldErrors.monthlyPrice}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${formId}-startDate`}>
              Rent start date <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${formId}-startDate`}
              type="date"
              value={values.startDate}
              onChange={(e) => setField("startDate", e.target.value)}
              disabled={scheduleLocked}
              aria-invalid={Boolean(fieldErrors.startDate)}
              aria-describedby={
                scheduleLocked
                  ? `${formId}-startDate-hint`
                  : fieldErrors.startDate
                    ? `${formId}-startDate-err`
                    : undefined
              }
              required
            />
            {scheduleLocked ? (
              <p
                id={`${formId}-startDate-hint`}
                className="text-muted-foreground text-xs"
              >
                Locked: this lease already has payments.
              </p>
            ) : fieldErrors.startDate ? (
              <p
                id={`${formId}-startDate-err`}
                className="text-destructive text-xs"
              >
                {fieldErrors.startDate}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${formId}-termMonths`}>
              Lease term (months) <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${formId}-termMonths`}
              type="number"
              inputMode="numeric"
              min={TERM_MONTHS_MIN}
              max={TERM_MONTHS_MAX}
              value={values.termMonths}
              onChange={(e) => setField("termMonths", e.target.value)}
              disabled={scheduleLocked}
              aria-invalid={Boolean(fieldErrors.termMonths)}
              aria-describedby={`${formId}-termMonths-hint`}
              required
            />
            <p
              id={`${formId}-termMonths-hint`}
              className="text-muted-foreground text-xs"
            >
              {scheduleLocked ? "Locked: payments already recorded." : termHint}
            </p>
          </div>
        </div>

        {isEdit && hasPayments ? (
          <p className="border-border bg-muted/40 text-muted-foreground rounded-lg border p-3 text-xs">
            The schedule is locked because this lease already has payments:
            regenerating it would re-date issued receipts. To change the start
            date or term, terminate this lease and register a new renter.
            {canOverrideTerms
              ? " (Your override permission does not lift this - the refusal is deliberate.)"
              : ""}
          </p>
        ) : null}

        {isEdit ? (
          <div className="space-y-2">
            <Label htmlFor={`${formId}-reason`}>
              Reason for this change (optional, recorded in the audit log)
            </Label>
            <Textarea
              id={`${formId}-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="e.g. Price agreed with the renter on 12 Mar 2026"
              aria-invalid={Boolean(fieldErrors.reason)}
            />
            {fieldErrors.reason ? (
              <p
                id={`${formId}-reason-err`}
                className="text-destructive text-xs"
              >
                {fieldErrors.reason}
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isEdit ? "Saving..." : "Registering..."}
            </>
          ) : isEdit ? (
            "Save changes"
          ) : (
            "Register renter"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Dialog shell.
 *
 * The fields live in {@link RenterFormFields}, mounted only while the dialog is
 * open, so each open starts from a clean form derived from the current renter -
 * no reset effect, no stale values, no extra render.
 */
export default function RenterFormDialog({
  open,
  onOpenChange,
  renter,
  hasPayments = false,
  canOverrideTerms = false,
  onSaved,
}: RenterFormDialogProps) {
  const isEdit = Boolean(renter);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Renter" : "Register Renter"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Personal details are freely editable. Changing the monthly price affects only unpaid months; paid months keep the price they were invoiced at."
              : "Registering a renter generates the full monthly rent schedule for the lease term in the same transaction."}
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <RenterFormFields
            key={renter?.id ?? "create"}
            renter={renter ?? null}
            hasPayments={hasPayments}
            canOverrideTerms={canOverrideTerms}
            onSaved={onSaved}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
