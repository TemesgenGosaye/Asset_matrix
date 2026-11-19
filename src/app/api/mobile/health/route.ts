import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Accept, Content-Type",
  "Access-Control-Max-Age": "600",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: "ready",
        service: "homedesk",
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: CORS_HEADERS },
    );
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        service: "homedesk",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: CORS_HEADERS },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export const dynamic = "force-dynamic";
