"use client";

import React, { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { EmployeeReferenceOption } from "@/lib/employees/types";

interface DepartmentComboboxProps {
  departments: EmployeeReferenceOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  allowAll?: boolean;
  allLabel?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function DepartmentCombobox({
  departments,
  value,
  onChange,
  placeholder = "Select department...",
  allowClear = false,
  allowAll = false,
  allLabel = "All departments",
  disabled = false,
  className,
  id,
}: DepartmentComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedDept = useMemo(() => {
    if (!value || value === "all") return null;
    return departments.find((d) => d.id === value) ?? null;
  }, [departments, value]);

  const displayLabel = useMemo(() => {
    if (value === "all") return allLabel;
    if (selectedDept) {
      return selectedDept.code
        ? `${selectedDept.name} (${selectedDept.code})`
        : selectedDept.name;
    }
    return placeholder;
  }, [value, allLabel, selectedDept, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between truncate text-left font-normal",
            !selectedDept && value !== "all" && "text-muted-foreground",
            className,
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <Building2 className="text-muted-foreground h-4 w-4 shrink-0" />
            <span className="truncate">{displayLabel}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="border-border w-[320px] p-0 shadow-lg"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder="Search department name or code..."
            className="h-9"
          />
          <CommandList className="max-h-64">
            <CommandEmpty>No matching department found.</CommandEmpty>
            <CommandGroup>
              {allowAll ? (
                <CommandItem
                  value="__all__"
                  onSelect={() => {
                    onChange("all");
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === "all"
                        ? "text-primary opacity-100"
                        : "opacity-0",
                    )}
                  />
                  <span>{allLabel}</span>
                </CommandItem>
              ) : null}

              {allowClear && value ? (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="text-muted-foreground cursor-pointer italic"
                >
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  <span>None (Clear selection)</span>
                </CommandItem>
              ) : null}

              {departments.map((dept) => {
                const isSelected = dept.id === value;
                return (
                  <CommandItem
                    key={dept.id}
                    value={`${dept.name} ${dept.code ?? ""}`}
                    onSelect={() => {
                      onChange(dept.id);
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        isSelected ? "text-primary opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {dept.name}
                      </span>
                      {dept.code ? (
                        <span className="text-muted-foreground font-mono text-xs">
                          Code: {dept.code}
                        </span>
                      ) : null}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
