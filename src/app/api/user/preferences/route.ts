import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { ACCEPTED_THEME_IDS, SYSTEM_THEME_ID } from "@/lib/themes";

const DEFAULTS = {
  theme: SYSTEM_THEME_ID,
  locale: "en",
  timezone: "UTC",
  currency: "USD",
  dateFormat: "MM/DD/YYYY",
  numberFormat: "1,234.56",
  pageSize: 20,
  onboardingCompleted: false,
  dashboardLayout: null,
  helpDismissed: null,
};

export async function GET() {
  try {
    const user = await requireApiAuth();

    const preferences = await prisma.user_preferences.findUnique({
      where: { userId: user.id },
    });

    if (!preferences) {
      return NextResponse.json(DEFAULTS);
    }

    return NextResponse.json(preferences);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireApiAuth();

    const body = await request.json();
    const {
      theme,
      locale,
      timezone,
      currency,
      dateFormat,
      numberFormat,
      pageSize,
      onboardingCompleted,
      dashboardLayout,
      helpDismissed,
    } = body;

    const values: Record<string, unknown> = {};

    // The theme column is free text, so an unvalidated write could store a value
    // the app has no CSS for (the client would apply a dead class to <html> and
    // the user would be stuck on an unstyled page). Reject anything the registry
    // does not know, and tell them which values are valid.
    if (theme !== undefined) {
      if (!ACCEPTED_THEME_IDS.includes(String(theme))) {
        return NextResponse.json(
          {
            error: "Unknown theme.",
            code: "INVALID_THEME",
            allowed: ACCEPTED_THEME_IDS,
          },
          { status: 422 },
        );
      }
      values.theme = theme;
    }

    if (locale !== undefined) values.locale = locale;
    if (timezone !== undefined) values.timezone = timezone;
    if (currency !== undefined) values.currency = currency;
    if (dateFormat !== undefined) values.dateFormat = dateFormat;
    if (numberFormat !== undefined) values.numberFormat = numberFormat;
    if (pageSize !== undefined) values.pageSize = pageSize;
    if (onboardingCompleted !== undefined)
      values.onboardingCompleted = onboardingCompleted;
    if (dashboardLayout !== undefined) values.dashboardLayout = dashboardLayout;
    if (helpDismissed !== undefined) values.helpDismissed = helpDismissed;

    const preferences = await prisma.user_preferences.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...values,
        updatedAt: new Date(),
      },
      update: {
        ...values,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(preferences);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
