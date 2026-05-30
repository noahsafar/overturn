import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __overturnPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__overturnPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__overturnPrisma = prisma;
}

export * from "@prisma/client";
export { encryptPhi, decryptPhi } from "./crypto";
