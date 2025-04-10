import { PrismaClient } from '@prisma/client'

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
//
// Learn more: 
// https://pris.ly/d/help/next-js-best-practices

const prismaClientSingleton = () => {
  return new PrismaClient({
    // Configure connection pool settings
    log: ['error', 'warn'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    // Add connection timeout
    // @ts-ignore - These are valid Prisma connection options
    __internal: {
      engine: {
        connectionTimeout: 5000, // 5 seconds
        pollInterval: 100, // 100ms
      },
    },
  })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

// Add a connection health check method
export const checkPrismaConnection = async (): Promise<boolean> => {
  try {
    // Simple query to check if the connection is working
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch (error) {
    console.error('Prisma connection check failed:', error)
    return false
  }
}

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma