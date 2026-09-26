"use client";

/* eslint-disable react/no-unescaped-entities -- prose-heavy documentation page */

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Home,
  Users,
  Calculator,
  GitBranch,
  ListChecks,
  TrendingUp,
  ArrowLeft,
  BookOpen,
  HelpCircle,
  Award,
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
  ArrowRight,
  Sparkles,
  Target,
  Layers,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function HouseQueueHelpClient() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="container mx-auto max-w-6xl space-y-8 px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg">
                <HelpCircle className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  House Allocation System Guide
                </h1>
                <p className="text-muted-foreground text-sm">
                  Everything you need to know about house allocation
                </p>
              </div>
            </div>
          </div>
        </div>
        <Button onClick={() => router.push("/house-queue")} variant="default">
          Go to Queue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">
            <BookOpen className="mr-2 h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="eligibility">
            <ListChecks className="mr-2 h-4 w-4" />
            Eligibility
          </TabsTrigger>
          <TabsTrigger value="priority">
            <TrendingUp className="mr-2 h-4 w-4" />
            Priority
          </TabsTrigger>
          <TabsTrigger value="process">
            <GitBranch className="mr-2 h-4 w-4" />
            Process
          </TabsTrigger>
          <TabsTrigger value="faq">
            <HelpCircle className="mr-2 h-4 w-4" />
            FAQ
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Hero Section */}
          <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:border-blue-800 dark:from-blue-950/30 dark:to-blue-900/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-6">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-500 text-white shadow-lg">
                  <Home className="h-8 w-8" />
                </div>
                <div className="space-y-3">
                  <h2 className="text-2xl font-bold">
                    Welcome to the House Allocation System
                  </h2>
                  <p className="text-muted-foreground leading-relaxed">
                    This system manages the fair and transparent allocation of company houses to eligible employees
                    based on a sophisticated dual-engine priority ranking and matching algorithm. Every allocation
                    decision is auditable, and the queue is recomputed in real-time to reflect the latest data.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Architecture */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-blue-500" />
                How the System Works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                {/* Engine A */}
                <div className="space-y-3 rounded-lg border bg-gradient-to-br from-purple-50 to-purple-100/50 p-5 dark:from-purple-950/30 dark:to-purple-900/20">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500 text-white">
                      <Calculator className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-semibold">Engine A: Priority Ranking</h3>
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Uses <strong>Multi-Criteria Decision Analysis (MCDA)</strong> to rank employees within their job
                    grade. Four weighted criteria determine priority: service years (40%), marital status (25%),
                    disability status (20%), and gender (15%).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-purple-100">
                      <Calendar className="mr-1 h-3 w-3" />
                      Service Years
                    </Badge>
                    <Badge variant="secondary" className="bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-purple-100">
                      <Heart className="mr-1 h-3 w-3" />
                      Marital Status
                    </Badge>
                    <Badge variant="secondary" className="bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-purple-100">
                      <Shield className="mr-1 h-3 w-3" />
                      Disability
                    </Badge>
                    <Badge variant="secondary" className="bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-purple-100">
                      <User className="mr-1 h-3 w-3" />
                      Gender
                    </Badge>
                  </div>
                </div>

                {/* Engine B */}
                <div className="space-y-3 rounded-lg border bg-gradient-to-br from-green-50 to-green-100/50 p-5 dark:from-green-950/30 dark:to-green-900/20">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500 text-white">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-semibold">Engine B: House Matching</h3>
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Automatically recommends the best available house from the eligible category pool using deterministic
                    ordering: Regular houses before Guest houses, sorted by location name and house number.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-100">
                      <Target className="mr-1 h-3 w-3" />
                      Category Match
                    </Badge>
                    <Badge variant="secondary" className="bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-100">
                      <Sparkles className="mr-1 h-3 w-3" />
                      Best Available
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg border-l-4 border-blue-500 p-4">
                <div className="flex gap-3">
                  <Info className="text-blue-500 h-5 w-5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium">Real-Time Computation</p>
                    <p className="text-muted-foreground text-sm">
                      The queue is recomputed live on every view—there's no cache. This ensures the priority ranks and
                      house recommendations always reflect the current employee, house, and allocation data.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Key Features */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-blue-500" />
                Key Features
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <h4 className="font-semibold">Fair & Transparent</h4>
                  <p className="text-muted-foreground text-sm">
                    Objective, quantifiable priority calculation ensures fair allocation based on multiple criteria.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                    <RefreshCw className="h-5 w-5" />
                  </div>
                  <h4 className="font-semibold">Always Current</h4>
                  <p className="text-muted-foreground text-sm">
                    Live computation means the queue automatically reflects changes to employee or house data.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <h4 className="font-semibold">Fully Auditable</h4>
                  <p className="text-muted-foreground text-sm">
                    Every allocation, skip, defer, and release action is logged with timestamp and decision maker.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Eligibility Tab */}
        <TabsContent value="eligibility" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-blue-500" />
                Eligibility Rules
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                House eligibility is determined solely by your job grade. Each grade range is assigned a house category.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Eligibility Table */}
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="border-b px-4 py-3 text-left text-sm font-semibold">Job Grade Range</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-semibold">House Category</th>
                      <th className="border-b px-4 py-3 text-left text-sm font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-mono">≥ 18 (&gt; 17)</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-purple-500">Staff</Badge>
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-sm">
                        Senior management and executive staff
                      </td>
                    </tr>
                    <tr className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-mono">15 – 17</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-blue-500">A</Badge>
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-sm">
                        Senior professional staff
                      </td>
                    </tr>
                    <tr className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-mono">12 – 14</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-green-500">B</Badge>
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-sm">
                        Mid-level professional staff
                      </td>
                    </tr>
                    <tr className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-mono">10 – 11</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-yellow-500">C</Badge>
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-sm">
                        Skilled technical staff
                      </td>
                    </tr>
                    <tr className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-mono">7 – 9</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-orange-500">D</Badge>
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-sm">
                        General technical staff
                      </td>
                    </tr>
                    <tr className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-mono">1 – 6</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-red-500">E</Badge>
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-sm">
                        Entry-level and support staff
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="bg-muted/50 rounded-lg border-l-4 border-amber-500 p-4">
                <div className="flex gap-3">
                  <AlertCircle className="text-amber-500 h-5 w-5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium">Not Eligible</p>
                    <p className="text-muted-foreground text-sm">
                      Employees with <strong>null, 0, or negative job grades</strong> are not eligible for housing.
                      Employment status must also be <strong>"active"</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Requirements Card */}
              <Card className="border-green-200 bg-gradient-to-br from-green-50 to-green-100/50 dark:border-green-800 dark:from-green-950/30 dark:to-green-900/20">
                <CardHeader>
                  <CardTitle className="text-base">Automatic Qualification</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="text-green-600 dark:text-green-400 h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Active Employment</p>
                      <p className="text-muted-foreground text-sm">
                        Your employment status must be set to "active" in the system
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="text-green-600 dark:text-green-400 h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Valid Job Grade</p>
                      <p className="text-muted-foreground text-sm">
                        You have a job grade between 1 and 18 or higher
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="text-green-600 dark:text-green-400 h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Automatic Inclusion</p>
                      <p className="text-muted-foreground text-sm">
                        You're automatically included in the queue—no application needed
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Priority Tab */}
        <TabsContent value="priority" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                Priority Calculation (MCDA)
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                Your position in the queue is determined by a weighted score combining four criteria within your job
                grade cohort.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Stage 1: Grouping */}
              <div className="space-y-3">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    1
                  </div>
                  Stage 1: Job Grade Grouping
                </h3>
                <p className="text-muted-foreground text-sm">
                  Employees are first grouped by job grade. Higher grades are processed first, so a Grade 18 employee
                  will always rank above a Grade 15 employee, regardless of other factors.
                </p>
              </div>

              {/* Stage 2: MCDA Scoring */}
              <div className="space-y-4">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    2
                  </div>
                  Stage 2: MCDA Scoring Within Grade
                </h3>
                <p className="text-muted-foreground text-sm">
                  Within your job grade cohort, these four weighted criteria determine your priority rank:
                </p>

                {/* Criteria Cards */}
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Service Years */}
                  <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100/50 dark:border-purple-800 dark:from-purple-950/30 dark:to-purple-900/20">
                    <CardContent className="pt-6">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Calendar className="text-purple-600 dark:text-purple-400 h-5 w-5" />
                            <h4 className="font-semibold">Service Years</h4>
                          </div>
                          <Badge className="bg-purple-600">40%</Badge>
                        </div>
                        <p className="text-muted-foreground text-sm">
                          Whole years elapsed since your hire date. Longer service = higher priority.
                        </p>
                        <div className="bg-muted/50 rounded border p-2 text-xs">
                          <strong>Example:</strong> 10 years of service scores higher than 5 years
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Marital Status */}
                  <Card className="border-pink-200 bg-gradient-to-br from-pink-50 to-pink-100/50 dark:border-pink-800 dark:from-pink-950/30 dark:to-pink-900/20">
                    <CardContent className="pt-6">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Heart className="text-pink-600 dark:text-pink-400 h-5 w-5" />
                            <h4 className="font-semibold">Marital Status</h4>
                          </div>
                          <Badge className="bg-pink-600">25%</Badge>
                        </div>
                        <p className="text-muted-foreground text-sm">
                          Reflects household need. Family size priority ordering.
                        </p>
                        <div className="bg-muted/50 space-y-1 rounded border p-2 text-xs">
                          <div><strong>Married:</strong> 3 points (highest)</div>
                          <div><strong>Widowed:</strong> 2 points</div>
                          <div><strong>Divorced:</strong> 1 point</div>
                          <div><strong>Single:</strong> 0 points</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Disability */}
                  <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:border-blue-800 dark:from-blue-950/30 dark:to-blue-900/20">
                    <CardContent className="pt-6">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Shield className="text-blue-600 dark:text-blue-400 h-5 w-5" />
                            <h4 className="font-semibold">Disability Status</h4>
                          </div>
                          <Badge className="bg-blue-600">20%</Badge>
                        </div>
                        <p className="text-muted-foreground text-sm">
                          Priority for accessibility/special needs.
                        </p>
                        <div className="bg-muted/50 space-y-1 rounded border p-2 text-xs">
                          <div><strong>Has Disability:</strong> 1 point</div>
                          <div><strong>No Disability:</strong> 0 points</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Gender */}
                  <Card className="border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:border-slate-800 dark:from-slate-950/30 dark:to-slate-900/20">
                    <CardContent className="pt-6">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <User className="text-slate-600 dark:text-slate-400 h-5 w-5" />
                            <h4 className="font-semibold">Gender</h4>
                          </div>
                          <Badge className="bg-slate-600">15%</Badge>
                        </div>
                        <p className="text-muted-foreground text-sm">
                          Equal treatment by default policy.
                        </p>
                        <div className="bg-muted/50 rounded border p-2 text-xs">
                          <div><strong>Male:</strong> 1 point</div>
                          <div><strong>Female:</strong> 1 point</div>
                          <div className="text-muted-foreground mt-1">Equal weighting for both genders</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Calculation Process */}
              <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/50 dark:border-amber-800 dark:from-amber-950/30 dark:to-amber-900/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Calculator className="h-5 w-5" />
                    How Scores Are Calculated
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white">
                      1
                    </div>
                    <div>
                      <p className="font-medium">Normalization</p>
                      <p className="text-muted-foreground">
                        Each criterion value is <strong>min-max normalized</strong> to a 0–1 scale within your job
                        grade cohort
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white">
                      2
                    </div>
                    <div>
                      <p className="font-medium">Weighting</p>
                      <p className="text-muted-foreground">
                        Normalized values are multiplied by their respective weights (40%, 25%, 20%, 15%)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white">
                      3
                    </div>
                    <div>
                      <p className="font-medium">Composite Score</p>
                      <p className="text-muted-foreground">
                        Weighted values are summed to produce a final score between <strong>0 and 1</strong> (higher
                        = higher priority)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white">
                      4
                    </div>
                    <div>
                      <p className="font-medium">Ranking</p>
                      <p className="text-muted-foreground">
                        Employees are ranked by composite score within their grade. <strong>Rank 1</strong> = highest
                        priority in the cohort
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tie-Breaking */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Deterministic Tie-Breaking</h3>
                <p className="text-muted-foreground text-sm">
                  When two employees have equal (or very similar) composite scores, the system uses this chain to break
                  ties fairly:
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    "Higher composite score",
                    "More service years",
                    "Earlier hire date",
                    "Employee number (ascending)",
                    "Stable input order",
                  ].map((rule, idx) => (
                    <div key={idx} className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
                        {idx + 1}
                      </div>
                      <span className="text-sm font-medium">{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Process Tab */}
        <TabsContent value="process" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-blue-500" />
                Complete Allocation Process
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                From joining the queue to receiving a house—here's the full journey
              </p>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* Process Flow */}
              <div className="space-y-6">
                {/* Step 1 */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white font-bold">
                      1
                    </div>
                    <div className="w-0.5 flex-1 bg-gradient-to-b from-blue-500 to-green-500 mt-2"></div>
                  </div>
                  <div className="flex-1 pb-8">
                    <h3 className="font-semibold text-lg mb-2">Automatic Enrollment</h3>
                    <p className="text-muted-foreground text-sm mb-3">
                      When your employee record is created with an active status and valid job grade, you're automatically
                      included in the next queue computation. No application needed!
                    </p>
                    <div className="bg-muted/30 rounded-lg border p-3">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="text-green-600 dark:text-green-400 h-4 w-4" />
                        <span className="font-medium">Status:</span>
                        <Badge variant="outline">Waiting</Badge>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white font-bold">
                      2
                    </div>
                    <div className="w-0.5 flex-1 bg-gradient-to-b from-green-500 to-purple-500 mt-2"></div>
                  </div>
                  <div className="flex-1 pb-8">
                    <h3 className="font-semibold text-lg mb-2">Priority Calculation</h3>
                    <p className="text-muted-foreground text-sm mb-3">
                      Engine A groups you by job grade and calculates your MCDA composite score based on service years,
                      marital status, disability, and gender. You receive a priority rank within your grade cohort.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800 p-3">
                        <div className="text-sm font-medium mb-1">Your Cohort</div>
                        <div className="text-muted-foreground text-xs">All Grade 12 employees</div>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800 p-3">
                        <div className="text-sm font-medium mb-1">Your Rank</div>
                        <div className="text-xs"><Badge className="bg-purple-600">Rank #5</Badge> of 22</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500 text-white font-bold">
                      3
                    </div>
                    <div className="w-0.5 flex-1 bg-gradient-to-b from-purple-500 to-orange-500 mt-2"></div>
                  </div>
                  <div className="flex-1 pb-8">
                    <h3 className="font-semibold text-lg mb-2">House Recommendation</h3>
                    <p className="text-muted-foreground text-sm mb-3">
                      Engine B finds the best available house in your category (B houses for Grade 12). It selects Regular
                      houses first, sorted by location and house number. Each house is recommended to only one employee per
                      computation pass.
                    </p>
                    <div className="bg-muted/30 rounded-lg border p-3">
                      <div className="flex items-start gap-3">
                        <Sparkles className="text-green-600 dark:text-green-400 h-5 w-5 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-sm font-medium">Recommended House</div>
                          <div className="text-muted-foreground text-xs mt-1">
                            <strong>House B-42</strong> • Block A • Regular
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-white font-bold">
                      4
                    </div>
                    <div className="w-0.5 flex-1 bg-gradient-to-b from-orange-500 to-green-500 mt-2"></div>
                  </div>
                  <div className="flex-1 pb-8">
                    <h3 className="font-semibold text-lg mb-2">Status Determination</h3>
                    <p className="text-muted-foreground text-sm mb-3">
                      Based on your eligibility and house availability, the system assigns one of these statuses:
                    </p>
                    <div className="grid gap-2">
                      <div className="flex items-center gap-3 rounded-lg border bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 p-3">
                        <CheckCircle2 className="text-green-600 dark:text-green-400 h-5 w-5" />
                        <div className="flex-1">
                          <div className="text-sm font-medium">Ready for Allocation</div>
                          <div className="text-muted-foreground text-xs">Eligible + House available</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 p-3">
                        <Clock className="text-amber-600 dark:text-amber-400 h-5 w-5" />
                        <div className="flex-1">
                          <div className="text-sm font-medium">No House Available</div>
                          <div className="text-muted-foreground text-xs">Eligible but no matching house in pool</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg border bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 p-3">
                        <XCircle className="text-red-600 dark:text-red-400 h-5 w-5" />
                        <div className="flex-1">
                          <div className="text-sm font-medium">Not Eligible</div>
                          <div className="text-muted-foreground text-xs">Job grade doesn't qualify</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white font-bold">
                      5
                    </div>
                    <div className="w-0.5 h-8 bg-gradient-to-b from-green-600 to-blue-500 mt-2"></div>
                  </div>
                  <div className="flex-1 pb-8">
                    <h3 className="font-semibold text-lg mb-2">HR Approval</h3>
                    <p className="text-muted-foreground text-sm mb-3">
                      HR reviews the recommendation and clicks "Approve" to allocate the house. The system verifies the
                      house is still available inside a database transaction to prevent double-booking.
                    </p>
                    <div className="bg-muted/30 rounded-lg border p-3">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="text-green-600 dark:text-green-400 h-4 w-4" />
                        <span className="font-medium">Status becomes:</span>
                        <Badge className="bg-green-600">Allocated</Badge>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 6 */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white font-bold">
                      6
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2">Allocation Complete</h3>
                    <p className="text-muted-foreground text-sm mb-3">
                      You now have an assigned house! The allocation decision is logged in the audit trail with timestamp
                      and decision maker. The house is removed from the available pool for future recommendations.
                    </p>
                    <Card className="border-green-200 bg-gradient-to-br from-green-50 to-green-100/50 dark:border-green-800 dark:from-green-950/30 dark:to-green-900/20">
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                          <Home className="text-green-600 dark:text-green-400 h-8 w-8" />
                          <div>
                            <div className="font-semibold">Congratulations!</div>
                            <div className="text-muted-foreground text-sm">You've been allocated House B-42</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>

              {/* Other Actions */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Other Possible Actions</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-amber-200 dark:border-amber-800">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                          <RefreshCw className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-semibold">Reassign</h4>
                          <p className="text-muted-foreground text-sm">
                            Change your allocated house to a different one. Previous allocation is released.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-red-200 dark:border-red-800">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                          <Ban className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-semibold">Skip</h4>
                          <p className="text-muted-foreground text-sm">
                            Permanently exclude from queue (e.g., you own your own house). Can be reactivated later.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-orange-200 dark:border-orange-800">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                          <PauseCircle className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-semibold">Defer</h4>
                          <p className="text-muted-foreground text-sm">
                            Temporarily exclude from queue (e.g., family not yet arrived). Can be reactivated anytime.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-blue-200 dark:border-blue-800">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                          <XCircle className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-semibold">Release</h4>
                          <p className="text-muted-foreground text-sm">
                            Return allocated house to pool. You go back to the queue and status is re-derived.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* FAQ Tab */}
        <TabsContent value="faq" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-blue-500" />
                Frequently Asked Questions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="faq-1">
                  <AccordionTrigger>
                    How often is the queue updated?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    The queue is <strong>recomputed in real-time</strong> on every view. There's no cache, so your
                    priority rank and house recommendation always reflect the current employee, house, and allocation
                    data. Changes to your service years, marital status, or job grade are immediately reflected.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-2">
                  <AccordionTrigger>
                    Can I apply for a specific house?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    No. Engine B automatically recommends the best available house in your category using deterministic
                    ordering (Regular before Guest, sorted by location and number). HR can override this recommendation
                    during approval, but the system ensures fair, objective allocation.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-3">
                  <AccordionTrigger>
                    What if there are no houses available in my category?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    Your status will show <Badge variant="outline">No House Available</Badge>. You remain in the queue
                    with your calculated priority rank. When a house becomes available (through new construction or a
                    release), the queue is recomputed and you'll be matched if you're the highest-priority employee
                    without a house.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-4">
                  <AccordionTrigger>
                    Why is someone with less service ranked higher than me?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    Priority is determined by a weighted combination of four criteria—not service years alone. If someone
                    ranks higher despite less service, they likely score better on marital status, disability status, or
                    the overall normalized composite. Remember: you're only compared to others in <strong>your job grade
                    cohort</strong>, and service years account for 40% of the score.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-5">
                  <AccordionTrigger>
                    Can my allocation be changed or taken away?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    Once allocated, your house is yours unless you explicitly release it, HR reassigns you to a different
                    house, or there's a policy violation. Allocations are persisted in the decision ledger and fully
                    auditable. The system never automatically reassigns houses—only authorized HR actions can change your
                    allocation.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-6">
                  <AccordionTrigger>
                    What does "Calculate" do?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    The <strong>Calculate</strong> button triggers an explicit recomputation of the queue (with an audit
                    log entry). Since the queue is already live, this is primarily for creating an audit trail showing who
                    triggered the recalculation and when. It's useful after bulk employee updates or house status changes.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-7">
                  <AccordionTrigger>
                    What happens if I get promoted to a higher grade?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    Your eligibility category changes immediately. For example, if you're promoted from Grade 11 (Category
                    C) to Grade 12 (Category B), you'll be moved to the Category B cohort in the next computation. Your
                    priority rank is recalculated within the new cohort, and Engine B will recommend a Category B house.
                    If you have an allocated Category C house, HR may reassign you or you may keep it depending on policy.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-8">
                  <AccordionTrigger>
                    How do I know my current rank and status?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    Visit the <strong>House Queue</strong> page. Search for your employee number or name. You'll see your:
                    <ul className="mt-2 space-y-1 list-disc list-inside">
                      <li><strong>Priority Rank</strong> — your position within your grade cohort (e.g., Rank #5 of 22)</li>
                      <li><strong>MCD Score</strong> — your composite score (0–1 scale)</li>
                      <li><strong>Queue Status</strong> — ready, no house, allocated, etc.</li>
                      <li><strong>Recommended House</strong> — if one is available</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-9">
                  <AccordionTrigger>
                    Is the allocation process fair?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    Yes. The system uses a <strong>quantifiable, objective algorithm</strong> with weighted criteria that
                    balance seniority, family need, special needs, and equal treatment. Every allocation is audited, and
                    the calculation is deterministic (same inputs always produce the same result). Manual overrides by HR
                    are logged for accountability.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-10">
                  <AccordionTrigger>
                    Can I see my allocation history?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    Yes. Every allocation, skip, defer, release, and reassignment action is logged in the audit trail.
                    Authorized users can view the complete history for any employee, including who made the decision,
                    when, and what the employee's score/rank was at that time.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          {/* Need More Help */}
          <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:border-blue-800 dark:from-blue-950/30 dark:to-blue-900/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
                  <HelpCircle className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Still have questions?</h3>
                  <p className="text-muted-foreground text-sm">
                    Contact your HR department for assistance with house allocation inquiries, status verification, or
                    appeals. They have access to your full allocation history and can explain specific decisions.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Footer Actions */}
      <div className="flex items-center justify-center gap-4 border-t pt-6">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
        <Button onClick={() => router.push("/house-queue")}>
          View House Queue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
