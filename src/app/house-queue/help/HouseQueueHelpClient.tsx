"use client";

/* eslint-disable react/no-unescaped-entities -- prose-heavy documentation page */

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import {
  Home,
  Users,
  Calculator,
  GitBranch,
  ListChecks,
  TrendingUp,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  HelpCircle,
  Building2,
  Calendar,
  Heart,
  Shield,
  User,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  PauseCircle,
  RefreshCw,
  Sparkles,
  Target,
  Layers,
  AlertCircle,
  FileText,
  Sliders,
  Printer,
  Wrench,
  Check,
  ShieldCheck,
  Award,
  Hash,
  Scale,
  FileSpreadsheet,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  HouseCategoryBadge,
  QueueStatusBadge,
} from "@/ui/household/house-status";
import { JOB_GRADE_HOUSE_RULES } from "@/lib/house-queue/eligibility";
import { MCDA_CRITERIA } from "@/lib/house-queue/weights";

export default function HouseQueueHelpClient() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="space-y-6 pb-12">
      {/* ─── Standard Breadcrumb Navigation ─── */}
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "House Hold", href: "/household/register" },
          { label: "House Queue", href: "/house-queue" },
          { label: "Help & Rules", href: "/house-queue/help" },
        ]}
      />

      {/* ─── Header Strip ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Housing Allocation & Queue Guide
            </h1>
          </div>
          <div className="mt-1 h-0.5 w-16 rounded bg-gradient-to-r from-brass-400 to-transparent" />
          <p className="max-w-3xl text-sm text-muted-foreground mt-2">
            Operating manual for the MSF housing system: MCDA priority ranking (Engine A),
            category matching (Engine B), house requests, allocation approvals, and handback inspection workflows.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-start sm:self-start">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/house-queue")}
            className="gap-1.5 shadow-xs"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Queue
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => router.push("/house-request")}
            className="gap-1.5 shadow-sm font-medium"
          >
            <FileText className="h-4 w-4" />
            House Requests
          </Button>
        </div>
      </div>

      {/* ─── Quick System Metrics Bar ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Eligible Categories</span>
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-xl font-bold">6 Bands</div>
          <p className="text-[11px] text-muted-foreground">Staff, A, B, C, D, E</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Engine A Criteria</span>
            <Scale className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="mt-2 text-xl font-bold">4 MCDA Weights</div>
          <p className="text-[11px] text-muted-foreground">Seniority, Family, Disability, Diversity</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Engine B Logic</span>
            <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2 text-xl font-bold">Deterministic</div>
          <p className="text-[11px] text-muted-foreground">Regular &gt; Guest, ordered by location</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Decision Authority</span>
            <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="mt-2 text-xl font-bold">Single Ledger</div>
          <p className="text-[11px] text-muted-foreground">100% auditable decisions & receipts</p>
        </div>
      </div>

      {/* ─── Main Content Tabs ─── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 h-auto p-1 bg-muted/60">
          <TabsTrigger value="overview" className="gap-1.5 py-2 text-xs">
            <BookOpen className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="eligibility" className="gap-1.5 py-2 text-xs">
            <ListChecks className="h-3.5 w-3.5" />
            Grade Bands
          </TabsTrigger>
          <TabsTrigger value="priority" className="gap-1.5 py-2 text-xs">
            <TrendingUp className="h-3.5 w-3.5" />
            MCDA Engine
          </TabsTrigger>
          <TabsTrigger value="matching" className="gap-1.5 py-2 text-xs">
            <Target className="h-3.5 w-3.5" />
            House Matching
          </TabsTrigger>
          <TabsTrigger value="lifecycle" className="gap-1.5 py-2 text-xs">
            <GitBranch className="h-3.5 w-3.5" />
            Handback Flow
          </TabsTrigger>
          <TabsTrigger value="faq" className="gap-1.5 py-2 text-xs">
            <HelpCircle className="h-3.5 w-3.5" />
            FAQ & Policy
          </TabsTrigger>
        </TabsList>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: SYSTEM OVERVIEW */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="overview" className="space-y-6">
          <Card className="border shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
                <Sparkles className="h-4 w-4" />
                Housing Allocation Architecture
              </div>
              <CardTitle className="text-xl">Dual-Engine Operating Model</CardTitle>
              <CardDescription>
                The Metahara Sugar Factory housing system coordinates two automated engines to eliminate subjectivity,
                prevent double-allocations, and maintain complete auditability.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Engine A Box */}
                <div className="rounded-xl border bg-card p-5 space-y-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Calculator className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-base">Engine A: Priority Ranking (MCDA)</h3>
                      <p className="text-xs text-muted-foreground">Ranks candidate employees within their job grade band</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Evaluates employees who submitted an active house request using multi-criteria normalization.
                    Scores consider years of service, household family need, disability, and gender balance to establish
                    a deterministic queue rank (#1, #2, #3…).
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Badge variant="secondary" className="text-[11px]">Seniority 40%</Badge>
                    <Badge variant="secondary" className="text-[11px]">Marital 25%</Badge>
                    <Badge variant="secondary" className="text-[11px]">Disability 20%</Badge>
                    <Badge variant="secondary" className="text-[11px]">Gender 15%</Badge>
                  </div>
                </div>

                {/* Engine B Box */}
                <div className="rounded-xl border bg-card p-5 space-y-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-base">Engine B: House Matching</h3>
                      <p className="text-xs text-muted-foreground">Selects optimal vacant houses for top-ranked requesters</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Scans the available inventory for each eligible category (Staff, A, B, C, D, E).
                    Filters out pending releases and maintenance units, prioritizing Regular over Guest houses
                    with deterministic sorting by location name and house number.
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Badge variant="secondary" className="text-[11px]">Category Strict</Badge>
                    <Badge variant="secondary" className="text-[11px]">Regular &gt; Guest</Badge>
                    <Badge variant="secondary" className="text-[11px]">Anti-Double-Booking</Badge>
                  </div>
                </div>
              </div>

              {/* Core Principles */}
              <div className="rounded-xl border bg-muted/30 p-5 space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Key Operating Principles
                </h4>
                <div className="grid gap-3 sm:grid-cols-3 text-sm">
                  <div>
                    <span className="font-medium text-foreground block mb-0.5">1. Request-Driven Queue</span>
                    <span className="text-xs text-muted-foreground">
                      Only employees with an active house request appear in the queue. Simply having an employee record does not trigger allocation.
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-foreground block mb-0.5">2. Real-Time Recomputation</span>
                    <span className="text-xs text-muted-foreground">
                      The queue computes live on each view directly from database records. Changes to job grades, service years, or house vacancies update immediately.
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-foreground block mb-0.5">3. Immutable Decisions</span>
                    <span className="text-xs text-muted-foreground">
                      Every allocation, skip, deferral, and release writes to an auditable decision ledger that generates verified handover receipts.
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick links banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
                <div className="space-y-0.5">
                  <div className="font-medium text-sm">Explore Related Housing Modules</div>
                  <div className="text-xs text-muted-foreground">Access live allocations, inspections, and engine tuning</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/houses/allocated">
                      Allocated Houses
                      <ArrowUpRight className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/houses/inspections">
                      Inspections Worklist
                      <ArrowUpRight className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/houses/terminated">
                      Terminated Archive
                      <ArrowUpRight className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: ELIGIBILITY & CATEGORY BANDS */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="eligibility" className="space-y-6">
          <Card className="border shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
                <ListChecks className="h-4 w-4" />
                Central Policy Rule
              </div>
              <CardTitle className="text-xl">Job Grade to House Category Mapping</CardTitle>
              <CardDescription>
                Eligibility is strictly determined by the employee's job grade. Each tier represents a discrete housing
                standard, and candidates compete only within their assigned category band.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Category Bands Table */}
              <div className="overflow-hidden rounded-xl border bg-card">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/60 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Job Grade Range</th>
                      <th className="px-4 py-3">Staff Level</th>
                      <th className="px-4 py-3">Eligible Housing Standard</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {JOB_GRADE_HOUSE_RULES.map((rule) => {
                      const gradeLabel =
                        rule.maxGrade === null
                          ? `Grade ${rule.minGrade}+ (Senior)`
                          : `Grade ${rule.minGrade} – ${rule.maxGrade}`;
                      const descriptions: Record<string, { role: string; housing: string }> = {
                        Staff: {
                          role: "Executive Leadership & Senior Management",
                          housing: "Executive villas and senior staff quarters",
                        },
                        A: {
                          role: "Senior Professional & Department Heads",
                          housing: "Category A standalone houses / residential units",
                        },
                        B: {
                          role: "Mid-level Professional & Senior Officers",
                          housing: "Category B residential quarters",
                        },
                        C: {
                          role: "Supervisors & Technical Specialists",
                          housing: "Category C residential units",
                        },
                        D: {
                          role: "General Technical Staff & Clerical Leads",
                          housing: "Category D residential quarters",
                        },
                        E: {
                          role: "Entry-level, Operational & Support Staff",
                          housing: "Category E residential quarters",
                        },
                      };
                      const desc = descriptions[rule.category] ?? {
                        role: "Standard staff assignment",
                        housing: "Designated residential category",
                      };
                      return (
                        <tr key={rule.category} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-semibold">
                            <HouseCategoryBadge category={rule.category} />
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold">
                            {gradeLabel}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{desc.role}</td>
                          <td className="px-4 py-3 text-muted-foreground">{desc.housing}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-muted/20">
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-muted-foreground">Ineligible</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        Unset / 0 / Negative
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" colSpan={2}>
                        Records without a recognized job grade cannot be assigned to an eligibility tier.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Qualification Requirements */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border bg-card p-4 space-y-1.5 shadow-xs">
                  <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Active House Request
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    The employee must have submitted an active house request from the House Request portal.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-4 space-y-1.5 shadow-xs">
                  <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Active Employment
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Employment status must be actively verified in the Employee Management master table.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-4 space-y-1.5 shadow-xs">
                  <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    No Active Allocation
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Employees who currently occupy an active allocated house cannot receive an additional house.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* TAB 3: ENGINE A (MCDA PRIORITY ENGINE) */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="priority" className="space-y-6">
          <Card className="border shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
                <TrendingUp className="h-4 w-4" />
                Engine A: Multi-Criteria Decision Analysis
              </div>
              <CardTitle className="text-xl">Priority Score Formulation</CardTitle>
              <CardDescription>
                Inside each job grade cohort, candidates are ranked using min-max normalized weighted criteria.
                Every score is deterministically reproducible and capped strictly within [0.000, 1.000].
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 4 Criteria Grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* 1. Service Years */}
                <div className="rounded-xl border bg-card p-4 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Calendar className="h-4 w-4 text-primary" />
                      Seniority
                    </div>
                    <Badge variant="secondary" className="font-bold text-xs bg-primary/10 text-primary">
                      40%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Whole years of continuous service elapsed from official hire date to the current date.
                  </p>
                  <div className="rounded border bg-muted/40 p-2 text-[11px] text-muted-foreground">
                    Normalized against the highest seniority inside the grade cohort.
                  </div>
                </div>

                {/* 2. Marital Status */}
                <div className="rounded-xl border bg-card p-4 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Heart className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                      Family Need
                    </div>
                    <Badge variant="secondary" className="font-bold text-xs bg-pink-500/10 text-pink-700 dark:text-pink-300">
                      25%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Household dependency need derived from verified marital status records.
                  </p>
                  <div className="rounded border bg-muted/40 p-2 text-[11px] text-muted-foreground space-y-0.5 font-mono">
                    <div>Married: 3 pts (highest)</div>
                    <div>Widowed: 2 pts · Divorced: 1 pt</div>
                    <div>Single: 0 pts</div>
                  </div>
                </div>

                {/* 3. Disability */}
                <div className="rounded-xl border bg-card p-4 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Shield className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      Accessibility
                    </div>
                    <Badge variant="secondary" className="font-bold text-xs bg-purple-500/10 text-purple-700 dark:text-purple-300">
                      20%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Priority consideration for employees with documented physical accessibility needs.
                  </p>
                  <div className="rounded border bg-muted/40 p-2 text-[11px] text-muted-foreground space-y-0.5 font-mono">
                    <div>Has disability: 1 pt</div>
                    <div>No disability: 0 pts</div>
                  </div>
                </div>

                {/* 4. Gender */}
                <div className="rounded-xl border bg-card p-4 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      Diversity
                    </div>
                    <Badge variant="secondary" className="font-bold text-xs bg-blue-500/10 text-blue-700 dark:text-blue-300">
                      15%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Equal treatment baseline established under enterprise HR policies.
                  </p>
                  <div className="rounded border bg-muted/40 p-2 text-[11px] text-muted-foreground space-y-0.5 font-mono">
                    <div>Female: 1 pt</div>
                    <div>Male: 1 pt</div>
                  </div>
                </div>
              </div>

              {/* Scoring Formula and Tie Breaking */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border bg-muted/20 p-5 space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-primary" />
                    Cohort Normalization Formula
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Within each grade cohort, every criterion level <code className="font-mono text-foreground font-semibold">v</code> is
                    rescaled via min-max normalization:
                  </p>
                  <div className="rounded-lg border bg-card p-3 font-mono text-xs text-center shadow-xs">
                    Score = (0.40 × Sv_norm) + (0.25 × Fam_norm) + (0.20 × Dis_norm) + (0.15 × Gen_norm)
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    If all cohort candidates have identical values for a criterion, the normalized score evaluates cleanly to 1.0.
                  </p>
                </div>

                <div className="rounded-xl border bg-muted/20 p-5 space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Hash className="h-4 w-4 text-primary" />
                    Deterministic Tie-Breaking Chain
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    When composite scores tie within the 1e-9 tolerance, ties are broken strictly in this order:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground font-medium">
                    <li><span className="text-foreground">Service Seniority:</span> Candidate with more whole service years wins.</li>
                    <li><span className="text-foreground">Birth Date (Age):</span> Older employee wins.</li>
                    <li><span className="text-foreground">Hire Date:</span> Employee hired earlier wins.</li>
                    <li><span className="text-foreground">Employee ID:</span> Alphabetical tie-break as final safeguard.</li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* TAB 4: ENGINE B (HOUSE MATCHING) */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="matching" className="space-y-6">
          <Card className="border shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
                <Target className="h-4 w-4" />
                Engine B: Inventory Matching
              </div>
              <CardTitle className="text-xl">Automated House Recommendation Logic</CardTitle>
              <CardDescription>
                Engine B inspects the real-time housing register to identify available houses for top-ranked queue
                candidates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border bg-card p-5 space-y-2 shadow-xs">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary text-xs font-bold">1</div>
                    Category Conformance
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Candidates are exclusively paired with houses matching their eligible category tier.
                    A Category B requester is only offered vacant Category B houses.
                  </p>
                </div>

                <div className="rounded-xl border bg-card p-5 space-y-2 shadow-xs">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary text-xs font-bold">2</div>
                    Regular before Guest
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Regular (R) houses are prioritized for permanent staff allocations before any Guest (G) houses are considered.
                  </p>
                </div>

                <div className="rounded-xl border bg-card p-5 space-y-2 shadow-xs">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary text-xs font-bold">3</div>
                    Location & Number Sort
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Among remaining vacant houses of identical type, recommendations follow stable alphabetical location order, then house number.
                  </p>
                </div>
              </div>

              {/* Exclusion safety */}
              <div className="rounded-xl border bg-muted/30 p-5 space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Ban className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  Automatic Vacancy Filtering & Anti-Double-Booking
                </h4>
                <div className="grid gap-3 sm:grid-cols-2 text-xs text-muted-foreground">
                  <div className="space-y-1">
                    <span className="font-medium text-foreground block">Excluded Units:</span>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Houses with active occupants (<span className="text-foreground">Occupied</span> status).</li>
                      <li>Houses currently undergoing handback inspections (<span className="text-foreground">Release Pending</span>).</li>
                      <li>Houses flagged as <span className="text-foreground">Under Maintenance</span> or damaged.</li>
                    </ul>
                  </div>
                  <div className="space-y-1">
                    <span className="font-medium text-foreground block">One-to-One Recommendation Guarantee:</span>
                    <p>
                      Each vacant house can be recommended to at most <strong>one</strong> employee across the entire queue
                      computation pass, eliminating recommendation collisions before HR approval.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* TAB 5: LIFECYCLE & HANDBACK WORKFLOW */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="lifecycle" className="space-y-6">
          <Card className="border shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
                <GitBranch className="h-4 w-4" />
                End-to-End Housing Lifecycle
              </div>
              <CardTitle className="text-xl">From Application to Archival Handback</CardTitle>
              <CardDescription>
                How employees progress through queue statuses, formal allocation approval, print verification, and handback inspections.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Queue Statuses Overview */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border bg-card p-3.5 space-y-1.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Ready for Allocation</span>
                    <QueueStatusBadge status="ready_for_allocation" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Candidate is ranked #1 in category cohort and a matching vacant house is available.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-3.5 space-y-1.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">No House Available</span>
                    <QueueStatusBadge status="no_house_available" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Candidate is fully eligible and ranked, but all category houses are occupied.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-3.5 space-y-1.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Allocated</span>
                    <QueueStatusBadge status="allocated" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Allocation approved by Housing Committee. Visible on the Allocated Houses page.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-3.5 space-y-1.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Release Pending</span>
                    <QueueStatusBadge status="RELEASE_PENDING" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Occupant is vacating; allocation stays active until handback inspection is completed.
                  </p>
                </div>
              </div>

              {/* The 4-Stage Workflow Timeline */}
              <div className="space-y-4 pt-2">
                <h4 className="font-semibold text-sm">Operational Milestone Timeline</h4>
                <div className="relative border-l-2 border-primary/20 ml-3 pl-6 space-y-6">
                  {/* Step 1 */}
                  <div className="relative">
                    <div className="absolute -left-[31px] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      1
                    </div>
                    <div className="space-y-1">
                      <div className="font-semibold text-sm">Request Submission</div>
                      <p className="text-xs text-muted-foreground">
                        Employee files a house request at <Link href="/house-request" className="text-primary hover:underline">/house-request</Link>.
                        The system checks eligibility and immediately positions the candidate in their job grade cohort.
                      </p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="relative">
                    <div className="absolute -left-[31px] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      2
                    </div>
                    <div className="space-y-1">
                      <div className="font-semibold text-sm">HR Committee Decision & Approval</div>
                      <p className="text-xs text-muted-foreground">
                        When status is Ready for Allocation, HR clicks "Approve". The transaction atomically locks the house,
                        creates an allocation ledger entry, records fixtures (beds, chairs, tables, lockers), and makes it visible
                        on the Allocated Houses registry.
                      </p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="relative">
                    <div className="absolute -left-[31px] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      3
                    </div>
                    <div className="space-y-1">
                      <div className="font-semibold text-sm">Official Handover Receipt & Moving Form</div>
                      <p className="text-xs text-muted-foreground">
                        The system generates official printable handover receipts (Original & Duplicate) with QR verification
                        and HRMS Form OF/MSF/HRMS/291 (Moving & Transfer Request) with designated vehicle and driver fields.
                      </p>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="relative">
                    <div className="absolute -left-[31px] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      4
                    </div>
                    <div className="space-y-1">
                      <div className="font-semibold text-sm">Release & Handback Inspection Gate</div>
                      <p className="text-xs text-muted-foreground">
                        When leaving company housing (Transfer, Employee Leave, or Retirement), a release workflow is initiated.
                        Facility inspectors complete a standardized checklist on <Link href="/houses/inspections" className="text-primary hover:underline">/houses/inspections</Link>,
                        logging damages, item costs, and photos before the unit returns to the available pool.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* TAB 6: FAQ & POLICY QUESTIONS */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="faq" className="space-y-6">
          <Card className="border shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
                <HelpCircle className="h-4 w-4" />
                Frequently Answered Inquiries
              </div>
              <CardTitle className="text-xl">Policy & Operational Guidelines</CardTitle>
              <CardDescription>
                Answers to common questions regarding queue positioning, priority calculations, promotions, and handback policies.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="faq-1">
                  <AccordionTrigger className="text-sm font-medium">
                    Do I automatically enter the House Queue?
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    No. The system requires an active <strong>House Request</strong> submitted through the House Request portal.
                    Once filed, your request is automatically validated against your active employment status and job grade,
                    placing you into your respective category band.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-2">
                  <AccordionTrigger className="text-sm font-medium">
                    How frequently are queue positions recomputed?
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    The queue computes <strong>live on every page load</strong>. There is no stale caching; any change to
                    an employee's seniority, marital status, job grade, or house availability is reflected instantaneously
                    across Engine A and Engine B.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-3">
                  <AccordionTrigger className="text-sm font-medium">
                    Can an employee select a specific house number?
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    Engine B automatically recommends the optimal house using an objective deterministic algorithm (Regular
                    houses before Guest houses, alphabetical by location, then house number). HR administrators can select an
                    alternate vacant house within the same eligible category if operational requirements necessitate an adjustment.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-4">
                  <AccordionTrigger className="text-sm font-medium">
                    Why might an employee with less seniority rank higher in the queue?
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    Seniority accounts for <strong>40%</strong> of the composite MCDA score. The remaining 60% balances
                    household dependency need (marital status, 25%), physical accessibility (disability status, 20%),
                    and demographic parity (gender, 15%). Furthermore, employees are only compared within their identical
                    job grade cohort.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-5">
                  <AccordionTrigger className="text-sm font-medium">
                    What happens if an employee is promoted to a higher job grade?
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    Upon promotion in the employee records, the system immediately shifts the candidate into the higher
                    category band on the next calculation. For example, moving from Grade 14 (Category B) to Grade 15
                    (Category A) re-ranks the candidate inside Cohort A and targets Category A houses.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-6">
                  <AccordionTrigger className="text-sm font-medium">
                    What is the difference between "Skip" and "Defer"?
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    <strong>Skip:</strong> Bypasses the employee for the immediate allocation round without removing their request
                    (e.g., if the employee wishes to await an upcoming vacancy).<br />
                    <strong>Defer:</strong> Temporarily pauses the candidate's active standing in the queue (e.g., if their family
                    has not relocated yet). Deferred candidates can be reactivated at any time without forfeiting seniority.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-7">
                  <AccordionTrigger className="text-sm font-medium">
                    Why can't I print a termination handback receipt immediately?
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    Printing of formal handback receipts is strictly protected by the <strong>Receipt Gate</strong>. A receipt
                    can only be printed once the facility inspector completes the handback inspection checklist, resolves any
                    damage costs, and records official resolution on the Inspections Worklist.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-8">
                  <AccordionTrigger className="text-sm font-medium">
                    Can engine weights and eligibility bands be adjusted?
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    Authorized system administrators can configure MCDA weights, threshold levels, and grade bands via
                    the <strong>Engine Configuration</strong> panel at <Link href="/house-queue/config" className="text-primary hover:underline">/house-queue/config</Link>.
                    All modifications require draft publication, pre-calculation impact previews, and support one-click rollback.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
