import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";

const root = process.cwd();

async function loadEnvFile(filename) {
  try {
    const content = await readFile(path.join(root, filename), "utf8");

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

await loadEnvFile(".env");

const config = {
  host: requireEnv("DATABASE_HOST"),
  port: Number(requireEnv("DATABASE_PORT")),
  user: requireEnv("DATABASE_USER"),
  password: requireEnv("DATABASE_PASSWORD"),
  multipleStatements: true
};

async function runSqlFile(connection, filename) {
  const filePath = path.join(root, "db", filename);
  const sql = await readFile(filePath, "utf8");
  await connection.query(sql);
}

async function main() {
  const connection = await mysql.createConnection(config);

  try {
    await runSqlFile(connection, "schema.sql");
    await runSqlFile(connection, "seed.sql");
    console.log("Database eb_elearning initialized successfully.");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Failed to initialize database:");
  console.error(error);
  process.exit(1);
});
