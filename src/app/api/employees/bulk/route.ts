import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  mapErrorToResponse,
  parseJsonBody,
  withEmployeeMutationContext,
} from "@/lib/employees/api";
import {
  bulkOperateEmployees,
  invalidateEmployeeCache,
} from "@/lib/employees/service";
import {
  bulkEmployeeOperationSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
} from "@/lib/employees/schemas";

/**
 * POST /api/employees/bulk
 *
 * Apply a bulk create / update / archive / restore.
 *
 * Permission mapping is deliberately per-operation rather than a single blanket
 * check: archiving must not be possible with only `employee:create`, and
 * restoring must not be possible with only `employee:edit`.
 */
const permissionForOperation = {
  create: "employee:create",
  update: "employee:edit",
  delete: "employee:delete",
  restore: "employee:restore",
} as const;

const bulkRequestShape = z.object({
  operation: bulkEmployeeOperationSchema,
  rows: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        values: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1)
    .max(500),
});

export async function POST(req: NextRequest) {
  try {
    const { data, response: parseError } = await parseJsonBody(
      req,
      bulkRequestShape,
    );
    if (parseError) return parseError;

    const { operation, rows } = data;
    const { response, context } = await withEmployeeMutationContext(
      permissionForOperation[operation],
    );
    if (response) return response;
    const { user, organizationId } = context!;

    // Validate each row against the schema for its operation. Rows that fail
    // validation are reported per-row rather than failing the whole request.
    const rowSchema =
      operation === "create" ? createEmployeeSchema : updateEmployeeSchema;

    const validated: { id?: string; input: Record<string, unknown> }[] = [];
    const failures: {
      index: number;
      employeeNumber?: string;
      message: string;
      code: string;
    }[] = [];

    rows.forEach((row, index) => {
      const parsed = rowSchema.safeParse(row.values);
      if (!parsed.success) {
        failures.push({
          index,
          employeeNumber:
            typeof row.values.employeeNumber === "string"
              ? row.values.employeeNumber
              : undefined,
          message: parsed.error.issues
            .map((i) => `${i.path.join(".") || "row"}: ${i.message}`)
            .join("; "),
          code: "VALIDATION",
        });
        return;
      }
      if (operation !== "create" && !row.id) {
        failures.push({
          index,
          employeeNumber:
            typeof row.values.employeeNumber === "string"
              ? row.values.employeeNumber
              : undefined,
          message: "id is required for this operation.",
          code: "VALIDATION",
        });
        return;
      }
      validated.push({
        id: row.id,
        input: parsed.data as Record<string, unknown>,
      });
    });

    if (validated.length === 0) {
      return NextResponse.json(
        { succeeded: 0, failed: failures },
        { status: 422 },
      );
    }

    const result = await bulkOperateEmployees({
      organizationId,
      actorId: user.id ?? null,
      operation,
      rows: validated,
    });

    invalidateEmployeeCache();

    // Merge pre-validation failures with runtime failures, preserving input order.
    const allFailures = [...failures, ...result.failed].sort(
      (a, b) => a.index - b.index,
    );

    return NextResponse.json(
      {
        operation,
        succeeded: result.succeeded.length,
        failed: allFailures,
      },
      { status: allFailures.length === 0 ? 200 : 207 },
    );
  } catch (error) {
    return mapErrorToResponse(error, "POST /api/employees/bulk error");
  }
}

export const dynamic = "force-dynamic";
