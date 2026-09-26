import React from "react";

interface CustomFieldValueProps {
  name: string;
  fieldType: string;
  value: string | null;
}

export function CustomFieldValue({
  name,
  fieldType,
  value,
}: CustomFieldValueProps) {
  return (
    <div className="flex justify-between">
      <dt className="text-foreground-500">{name}</dt>
      <dd className="font-medium">{renderValue(fieldType, value)}</dd>
    </div>
  );
}

function renderValue(fieldType: string, value: string | null): React.ReactNode {
  if (!value) return "-";

  switch (fieldType) {
    case "checkbox":
      return value === "true" ? "Yes" : "No";

    case "url":
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2"
        >
          {value.replace(/^https?:\/\//, "").slice(0, 30)}
        </a>
      );

    case "email":
      return (
        <a
          href={`mailto:${value}`}
          className="text-primary underline underline-offset-2"
        >
          {value}
        </a>
      );

    case "currency":
      return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    case "color":
      return (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-4 w-4 rounded border"
            style={{ backgroundColor: value }}
          />
          {value}
        </span>
      );

    case "multiselect":
      return value
        .split(",")
        .map((v) => v.trim())
        .join(", ");

    case "date":
      try {
        return new Date(value).toLocaleDateString();
      } catch {
        return value;
      }

    case "number":
      return Number(value).toLocaleString();

    case "text":
    case "textarea":
    case "select":
    default:
      return value;
  }
}
