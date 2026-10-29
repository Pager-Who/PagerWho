import { Prisma, PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
export { Prisma };
export type { PrismaClient } from "@prisma/client";
