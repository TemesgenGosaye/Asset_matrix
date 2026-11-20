import { z } from "zod";
import { HOUSE_TYPES } from "@/lib/household-constants";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const houseAnalyticsRangeSchema = z.enum([
  "month",
  "last_month",
  "quarter",
  "year",
  "custom",
]);

export const houseAnalyticsQuerySchema = z
  .object({
    range: houseAnalyticsRangeSchema.default("month"),
    from: z.string().regex(datePattern).optional(),
    to: z.string().regex(datePattern).optional(),
    houseType: z.union([z.literal("all"), z.enum(HOUSE_TYPES)]).default("all"),
  })
  .superRefine((value, ctx) => {
    if (value.range === "custom" && (!value.from || !value.to)) {
      ctx.addIssue({
        code: "custom",
        message: "Custom ranges require from and to dates",
      });
    }
    if (
      (value.from && Number.isNaN(Date.parse(value.from))) ||
      (value.to && Number.isNaN(Date.parse(value.to)))
    ) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
    }
    if (value.from && value.to && value.from > value.to) {
      ctx.addIssue({ code: "custom", message: "from must not be after to" });
    }
  });

export type HouseAnalyticsQuery = z.infer<typeof houseAnalyticsQuerySchema>;
export type HouseAnalyticsRange = z.infer<typeof houseAnalyticsRangeSchema>;

const kpiSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number(),
  unit: z.enum(["count", "percent"]),
  trend: z.number().nullable(),
  sparkline: z.array(z.number()),
  href: z.string(),
  variant: z.enum(["brass", "navy", "warning", "destructive", "success"]),
  positiveIsGood: z.boolean(),
  hint: z.string(),
});

const monthlyPointSchema = z.object({
  month: z.string(),
  label: z.string(),
  allocations: z.number(),
  releases: z.number(),
  requests: z.number(),
  housesAdded: z.number(),
  inspectionsCompleted: z.number(),
});

const linkSegmentSchema = z.object({
  name: z.string(),
  value: z.number(),
  href: z.string(),
});

const houseTypeSegmentSchema = z.object({
  type: z.string(),
  free: z.number(),
  occupied: z.number(),
  awaitingInspection: z.number(),
  inactive: z.number(),
});

const supplyDemandSegmentSchema = z.object({
  band: z.string(),
  demand: z.number(),
  supply: z.number(),
  shortage: z.number(),
  href: z.string(),
});

const queueFunnelSchema = z.object({
  eligible: z.number(),
  ready: z.number(),
  allocated: z.number(),
  skipped: z.number(),
  deferred: z.number(),
  noHouse: z.number(),
  notEligible: z.number(),
});

const topQueueRowSchema = z.object({
  rank: z.number().nullable(),
  name: z.string(),
  employeeNumber: z.string(),
  grade: z.string(),
  score: z.number().nullable(),
  status: z.string(),
  href: z.string(),
});

const activityItemSchema = z.object({
  id: z.string(),
  action: z.string(),
  entity: z.string(),
  description: z.string(),
  at: z.string(),
  href: z.string(),
});

const inspectionPipelineSchema = z.object({
  pending: z.number(),
  scheduled: z.number(),
  completed: z.number(),
  avgDaysWaiting: z.number(),
});

export const houseAnalyticsResponseSchema = z.object({
  meta: z.object({
    generatedAt: z.string(),
    range: houseAnalyticsRangeSchema,
    from: z.string(),
    to: z.string(),
    houseType: z.string(),
  }),
  kpis: z.array(kpiSchema),
  occupancy: z.object({
    value: z.number(),
    occupied: z.number(),
    total: z.number(),
  }),
  monthly: z.array(monthlyPointSchema),
  statusDistribution: z.array(linkSegmentSchema),
  housesByType: z.array(houseTypeSegmentSchema),
  supplyDemand: z.array(supplyDemandSegmentSchema),
  funnel: queueFunnelSchema,
  releaseReasons: z.array(linkSegmentSchema),
  topQueue: z.array(topQueueRowSchema),
  activity: z.array(activityItemSchema),
  inspections: inspectionPipelineSchema,
});

export type HouseAnalyticsResponse = z.infer<
  typeof houseAnalyticsResponseSchema
>;
export type HouseAnalyticsKpi = z.infer<typeof kpiSchema>;
