import mysql from "mysql2/promise";
import type { PoolConnection, QueryResult, RowDataPacket } from "mysql2/promise";

type GlobalWithPool = typeof globalThis & {
  ebLearningPool?: mysql.Pool;
};

type SqlValue = string | number | boolean | Date | null | Buffer | SqlValue[];

const globalForPool = globalThis as GlobalWithPool;

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function createPool() {
  if (process.env.DATABASE_URL) {
    return mysql.createPool(process.env.DATABASE_URL);
  }

  return mysql.createPool({
    host: requireEnv("DATABASE_HOST"),
    port: Number(requireEnv("DATABASE_PORT")),
    user: requireEnv("DATABASE_USER"),
    password: requireEnv("DATABASE_PASSWORD"),
    database: requireEnv("DATABASE_NAME"),
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
    charset: "utf8mb4"
  });
}

export const db = globalForPool.ebLearningPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForPool.ebLearningPool = db;
}

export async function queryRows<T extends RowDataPacket[]>(sql: string, values?: SqlValue[]) {
  const [rows] = await db.query<T>(sql, values);
  return rows;
}

export async function executeQuery<T extends QueryResult>(sql: string, values?: SqlValue[]) {
  const [result] = await db.execute<T>(sql, values);
  return result;
}

export async function withTransaction<T>(handler: (connection: PoolConnection) => Promise<T>) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await handler(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}
