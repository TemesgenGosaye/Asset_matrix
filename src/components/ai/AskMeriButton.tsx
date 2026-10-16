"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askAssistant } from "@/lib/ai/events";
import { ASSISTANT_BRAND } from "@/lib/ai/brand";
import { cn } from "@/lib/utils";

/**
 * An inline "ask about this" trigger.
 *
 * The drawer answers questions about the portal. This answers questions about
 * *this record* — the one the user is already looking at. Clicking it opens the
 * drawer with a question that names the record, so the user does not have to
 * describe what they are looking at to get a useful answer.
 *
 * It dispatches an event rather than importing the drawer, so a page can hold
 * the trigger without pulling the whole assistant UI into its bundle.
 */

export interface AskMeriButtonProps {
  /**
   * The question to ask. Should name the record, e.g. "Summarise the
   * maintenance history for laptop MSF-0042."
   */
  question: string;
  /** Button label. Defaults to the assistant's name. */
  label?: string;
  /** Visual weight, matched to the surrounding toolbar. */
  variant?: "ghost" | "outline" | "secondary";
  size?: "sm" | "default" | "icon";
  className?: string;
  children?: React.ReactNode;
}

export function AskMeriButton({
  question,
  label,
  variant = "ghost",
  size = "sm",
  className,
  children,
}: AskMeriButtonProps) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={() => askAssistant(question)}
      title={`Ask ${ASSISTANT_BRAND.latin} — Ctrl+J`}
      aria-label={`Ask ${ASSISTANT_BRAND.latin}: ${question}`}
      className={cn(
        "text-primary hover:text-primary dark:text-primary gap-1.5",
        className,
      )}
    >
      <Sparkles className="h-3.5 w-3.5" />
      {children ?? label ?? ASSISTANT_BRAND.latin}
    </Button>
  );
}

export default AskMeriButton;
