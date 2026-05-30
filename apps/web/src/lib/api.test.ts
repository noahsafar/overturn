import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Mock auth + prisma before importing the module under test.
vi.mock("./auth", () => ({
  requireUser: vi.fn(),
}));
vi.mock("@overturn/db", () => ({
  prisma: {
    auditEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { apiHandler, notFound, conflict } from "./api";
import { requireUser } from "./auth";
import { prisma } from "@overturn/db";

const mockUser = {
  id: "user_1",
  clerkId: "clerk_1",
  email: "a@b.c",
  practiceId: "practice_1",
  role: "ADMIN" as const,
};

function makeReq(opts: { headers?: Record<string, string>; body?: unknown } = {}) {
  return new Request("http://localhost/", {
    method: "GET",
    headers: { "user-agent": "vitest", ...(opts.headers ?? {}) },
  }) as never;
}

function makeArgs(params: Record<string, string> = {}) {
  return { params: Promise.resolve(params) };
}

describe("apiHandler", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(prisma.auditEvent.create).mockClear();
  });

  it("returns 401 if requireUser throws", async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error("UNAUTHENTICATED"));
    const handler = apiHandler({}, async () => ({ ok: true }));
    const res = await handler(makeReq(), makeArgs());
    expect(res.status).toBe(401);
  });

  it("returns 403 if role insufficient", async () => {
    vi.mocked(requireUser).mockResolvedValue({ ...mockUser, role: "STAFF" });
    const handler = apiHandler({ requiredRole: "OWNER" }, async () => ({ ok: true }));
    const res = await handler(makeReq(), makeArgs());
    expect(res.status).toBe(403);
  });

  it("allows when role at or above required", async () => {
    vi.mocked(requireUser).mockResolvedValue({ ...mockUser, role: "OWNER" });
    const handler = apiHandler({ requiredRole: "STAFF" }, async () => ({ ok: true }));
    const res = await handler(makeReq(), makeArgs());
    expect(res.status).toBe(200);
  });

  it("validates params and returns 400 on failure", async () => {
    vi.mocked(requireUser).mockResolvedValue(mockUser);
    const handler = apiHandler(
      { paramsSchema: z.object({ id: z.string().min(5) }) },
      async () => ({ ok: true }),
    );
    const res = await handler(makeReq(), makeArgs({ id: "no" }));
    expect(res.status).toBe(400);
  });

  it("records an audit event when audit meta provided", async () => {
    vi.mocked(requireUser).mockResolvedValue(mockUser);
    const handler = apiHandler(
      {
        audit: { action: "test.action", resourceType: "test" },
      },
      async () => ({ ok: true }),
    );
    await handler(makeReq(), makeArgs());
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.auditEvent.create).mock.calls[0]![0];
    expect(call.data.action).toBe("test.action");
    expect(call.data.practiceId).toBe("practice_1");
  });

  it("translates notFound() to 404", async () => {
    vi.mocked(requireUser).mockResolvedValue(mockUser);
    const handler = apiHandler({}, async () => {
      throw notFound();
    });
    const res = await handler(makeReq(), makeArgs());
    expect(res.status).toBe(404);
  });

  it("translates conflict() to 409", async () => {
    vi.mocked(requireUser).mockResolvedValue(mockUser);
    const handler = apiHandler({}, async () => {
      throw conflict("nope");
    });
    const res = await handler(makeReq(), makeArgs());
    expect(res.status).toBe(409);
  });
});
