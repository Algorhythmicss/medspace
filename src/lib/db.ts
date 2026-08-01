import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Constructed lazily on first query. During a build there is no DATABASE_URL and
// no request, so eager construction would fail the build rather than the request.
function makeClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// One client (one connection pool) reused across every query. Cache it on the
// global in ALL environments: in dev it survives hot-reload; on serverless it is
// reused across warm invocations of the same instance, so the pool is opened
// once per instance rather than once per query. (The previous code returned a
// fresh client on every access in production, which leaks a new pg pool per
// query and exhausts the Supabase pooler under load.)
function client(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = makeClient();
  }
  return globalForPrisma.prisma;
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(client(), prop, receiver);
  },
});
