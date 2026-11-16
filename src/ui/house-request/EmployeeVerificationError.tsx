"use client";

import React from "react";
import { AlertCircle, ClockAlert, RefreshCw, Search, ShieldAlert, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HouseRequestFailure } from "@/lib/house-requests/failures";

export interface EmployeeVerificationErrorProps {
  failure: HouseRequestFailure;
  searchedId?: string;
  onRetry: () => void;
  onSearchAgain: () => void;
}

/**
 * Error and timeout notification for Employee Verification, styled seamlessly
 * inside the same 680px white sheet canvas.
 */
export default function EmployeeVerificationError({
  failure,
  searchedId,
  onRetry,
  onSearchAgain,
}: EmployeeVerificationErrorProps) {
  const isNotFound =
    failure.code === "EMPLOYEE_NOT_FOUND" || failure.code === "EMPLOYEE_ARCHIVED";
  const isTimeout =
    failure.title.toLowerCase().includes("timeout") ||
    failure.title.toLowerCase().includes("timed out") ||
    failure.message.toLowerCase().includes("10 second") ||
    failure.message.toLowerCase().includes("10-second") ||
    Boolean(failure.hint?.toLowerCase().includes("10-second"));
  const isNetworkOrServer =
    failure.code === "NETWORK_ERROR" || failure.code === "SERVER_ERROR";

  return (
    <div className="evr-page-wrap">
      <section
        className="evr-sheet"
        role="alert"
        aria-live="assertive"
        aria-label="Verification Error"
      >
        <div style={{ padding: "16px 8px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "8px",
                backgroundColor: "#fdf0ee",
                color: "#b42318",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {isNotFound ? (
                <UserX size={22} aria-hidden />
              ) : isTimeout ? (
                <ClockAlert size={22} aria-hidden />
              ) : isNetworkOrServer ? (
                <AlertCircle size={22} aria-hidden />
              ) : (
                <ShieldAlert size={22} aria-hidden />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <h3
                  style={{
                    color: "var(--evr-navy)",
                    fontSize: "14.5px",
                    fontWeight: 700,
                    margin: 0,
                  }}
                >
                  {isNotFound
                    ? "Employee Not Found"
                    : isTimeout
                      ? "Verification Timed Out"
                      : failure.title || "Verification Failed"}
                </h3>
                <span
                  style={{
                    backgroundColor: "#fdf0ee",
                    color: "#b42318",
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: "4px",
                    textTransform: "uppercase",
                  }}
                >
                  {isNotFound ? "Register 404" : isTimeout ? "10s Timeout" : failure.code}
                </span>
              </div>

              <p
                style={{
                  color: "var(--evr-value-text)",
                  fontSize: "12px",
                  lineHeight: "1.5",
                  marginTop: "6px",
                  marginBottom: "8px",
                }}
              >
                {isNotFound ? (
                  <>
                    No active employee matches ID <strong>{searchedId || "entered"}</strong> in the
                    Metahara Sugar Factory Employee Register. Please verify the Employee ID issued
                    by HR and search again.
                  </>
                ) : isTimeout ? (
                  "The Employee Register did not respond within the 10-second verification window. Please verify network connectivity and try again."
                ) : (
                  failure.message || "An unexpected error occurred while communicating with the register."
                )}
              </p>

              {failure.hint && !isNotFound && !isTimeout ? (
                <p style={{ color: "var(--evr-muted-text)", fontSize: "11px", marginBottom: "8px" }}>
                  💡 {failure.hint}
                </p>
              ) : null}

              <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
                {isNotFound ? (
                  <Button
                    type="button"
                    variant="default"
                    onClick={onSearchAgain}
                    className="h-8 gap-1.5 rounded text-xs font-semibold"
                    style={{ backgroundColor: "var(--evr-navy)", color: "#ffffff" }}
                  >
                    <Search size={13} aria-hidden />
                    Search again
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="default"
                    onClick={onRetry}
                    className="h-8 gap-1.5 rounded text-xs font-semibold"
                    style={{ backgroundColor: "var(--evr-navy)", color: "#ffffff" }}
                  >
                    <RefreshCw size={13} aria-hidden />
                    Try again
                  </Button>
                )}

                {!isNotFound ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onSearchAgain}
                    className="h-8 rounded text-xs"
                  >
                    Search different ID
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
