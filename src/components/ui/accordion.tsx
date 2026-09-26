"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type AccordionValue = string | null;

interface AccordionContextValue {
  value: AccordionValue;
  setValue: (value: AccordionValue) => void;
}

const AccordionContext = React.createContext<AccordionContextValue>({
  value: null,
  setValue: () => {},
});

function Accordion({
  type = "single",
  collapsible = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  type?: "single" | "multiple";
  collapsible?: boolean;
}) {
  const [value, setValue] = React.useState<AccordionValue>(null);
  return (
    <AccordionContext.Provider value={{ value, setValue }}>
      <div className={cn("w-full", className)} {...props}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const AccordionItemContext = React.createContext<AccordionItemContextValue | null>(
  null,
);

function AccordionItem({
  value,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const accordion = React.useContext(AccordionContext);
  const open = accordion.value === value;
  const setOpen = (next: boolean) => accordion.setValue(next ? value : null);
  return (
    <AccordionItemContext.Provider value={{ open, setOpen }}>
      <div className={cn("border-b", className)} {...props}>
        {children}
      </div>
    </AccordionItemContext.Provider>
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const item = React.useContext(AccordionItemContext);
  if (!item)
    throw new Error("AccordionTrigger must be used within an AccordionItem");
  return (
    <button
      type="button"
      aria-expanded={item.open}
      onClick={() => item.setOpen(!item.open)}
      className={cn(
        "flex flex-1 items-center justify-between py-4 text-left text-sm font-medium transition-all hover:underline",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
          item.open && "rotate-180",
        )}
      />
    </button>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const item = React.useContext(AccordionItemContext);
  if (!item)
    throw new Error("AccordionContent must be used within an AccordionItem");
  if (!item.open) return null;
  return (
    <div className={cn("pb-4 pt-0 text-sm", className)} {...props}>
      {children}
    </div>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };