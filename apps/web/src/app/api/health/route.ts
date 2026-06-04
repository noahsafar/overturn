// GET /api/health — health check endpoint for monitoring and load balancer probes.

import { prisma } from "@overturn/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  components: {
    database: { status: string; latency?: number; message?: string };
    clerk: { status: string; message?: string };
    worker: { status: string; message?: string };
  };
}

async function checkDatabase() {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    return { status: "healthy", latency };
  } catch (error) {
    return {
      status: "unhealthy",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function checkClerk() {
  const clerkKey = process.env.CLERK_SECRET_KEY;
  if (clerkKey) {
    return { status: "healthy", message: "Clerk configured" };
  }
  return {
    status: "degraded",
    message: "Clerk not configured (dev auth mode)",
  };
}

async function checkWorker() {
  const workerUrl = process.env.WORKER_INTERNAL_URL || "http://localhost:8001";
  try {
    const response = await fetch(`${workerUrl}/health/ready`, {
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    if (response.ok) {
      return { status: "healthy" };
    }
    return {
      status: "unhealthy",
      message: `Worker health check failed: ${response.status}`,
    };
  } catch (error) {
    return {
      status: "degraded",
      message: error instanceof Error ? error.message : "Worker unreachable",
    };
  }
}

export async function GET() {
  const components = {
    database: await checkDatabase(),
    clerk: await checkClerk(),
    worker: await checkWorker(),
  };

  // Determine overall status
  const isHealthy = Object.values(components).every(
    (c) => c.status === "healthy" || c.status === "degraded"
  );

  const status: "healthy" | "degraded" | "unhealthy" = isHealthy
    ? Object.values(components).some((c) => c.status === "degraded")
      ? "degraded"
      : "healthy"
    : "unhealthy";

  const response: HealthResponse = {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || "dev",
    components,
  };

  // Return appropriate status code
  const statusCode = status === "unhealthy" ? 503 : 200;
  return NextResponse.json(response, { status: statusCode });
}
