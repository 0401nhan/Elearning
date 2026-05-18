const root = process.cwd();

let createServer;
let readFile;
let path;
let next;
let mysql;

async function loadRuntimeModules() {
  ({ createServer } = await import("node:http"));
  ({ readFile } = await import("node:fs/promises"));
  path = await import("node:path");

  const mysqlModule = await import("mysql2/promise");
  mysql = mysqlModule.default ?? mysqlModule;
}

async function loadNextModule() {
  next = (await import("next")).default;
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  const value = trimmed
    .slice(separatorIndex + 1)
    .trim()
    .replace(/^['"]|['"]$/g, "");

  return key ? [key, value] : null;
}

async function loadEnvFile(filename) {
  try {
    const content = await readFile(path.join(root, filename), "utf8");

    for (const line of content.split(/\r?\n/)) {
      const entry = parseEnvLine(line);
      if (!entry) {
        continue;
      }

      const [key, value] = entry;
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

function validateStartupEnv() {
  if (process.env.NODE_ENV === "production") {
    requireEnv("SESSION_SECRET");
  }
}

function getDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!databaseName) {
      throw new Error("DATABASE_URL must include a database name.");
    }

    return {
      connection: {
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        multipleStatements: true,
        charset: "utf8mb4"
      },
      databaseName
    };
  }

  return {
    connection: {
      host: requireEnv("DATABASE_HOST"),
      port: Number(requireEnv("DATABASE_PORT")),
      user: requireEnv("DATABASE_USER"),
      password: requireEnv("DATABASE_PASSWORD"),
      multipleStatements: true,
      charset: "utf8mb4"
    },
    databaseName: requireEnv("DATABASE_NAME")
  };
}

function quoteIdentifier(identifier) {
  return `\`${identifier.replace(/`/g, "``")}\``;
}

function normalizeSqlDatabaseName(sql, databaseName) {
  const quotedName = quoteIdentifier(databaseName);

  return sql
    .replace(
      /CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+[`"]?eb_elearning[`"]?\s+CHARACTER\s+SET\s+utf8mb4\s+COLLATE\s+utf8mb4_unicode_ci\s*;/i,
      `CREATE DATABASE IF NOT EXISTS ${quotedName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    )
    .replace(/USE\s+[`"]?eb_elearning[`"]?\s*;/gi, `USE ${quotedName};`);
}

function stripDatabaseSelectionSql(sql) {
  return sql
    .replace(
      /CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+[`"]?[^`";\s]+[`"]?\s+CHARACTER\s+SET\s+utf8mb4\s+COLLATE\s+utf8mb4_unicode_ci\s*;/gi,
      ""
    )
    .replace(/USE\s+[`"]?[^`";\s]+[`"]?\s*;/gi, "");
}

async function readDbSql(filename, databaseName, useCurrentDatabase = false) {
  const sql = await readFile(path.join(root, "db", filename), "utf8");
  const normalizedSql = normalizeSqlDatabaseName(sql, databaseName);
  return useCurrentDatabase ? stripDatabaseSelectionSql(normalizedSql) : normalizedSql;
}

async function runSqlFile(connection, filename, databaseName, useCurrentDatabase = false) {
  const sql = await readDbSql(filename, databaseName, useCurrentDatabase);
  await connection.query(sql);
}

async function createDatabase(connection, databaseName) {
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(databaseName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
}

async function databaseExists(connection, databaseName) {
  const [rows] = await connection.query(
    "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ? LIMIT 1",
    [databaseName]
  );

  return rows.length > 0;
}

async function getTableNames(connection, databaseName) {
  const [rows] = await connection.query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?",
    [databaseName]
  );

  return new Set(rows.map((row) => row.TABLE_NAME));
}

function formatDatabaseAccessError(error, databaseName) {
  if (error?.code === "ER_DBACCESS_DENIED_ERROR" || error?.code === "ER_ACCESS_DENIED_ERROR") {
    return new Error(
      [
        `MySQL user cannot access database "${databaseName}".`,
        "Create this database in MySQL/cPanel and grant the configured user full privileges,",
        "or update DATABASE_NAME/DATABASE_URL to the exact database assigned to this user.",
        `Original MySQL error: ${error.sqlMessage || error.message}`
      ].join(" ")
    );
  }

  return error;
}

function hasRequiredTables(tableNames) {
  const requiredTables = [
    "departments",
    "roles",
    "employees",
    "tests",
    "questions",
    "test_assignments",
    "test_attempts"
  ];

  return requiredTables.every((tableName) => tableNames.has(tableName));
}

async function ensureDatabase() {
  if (process.env.AUTO_DB_INIT === "false") {
    console.log("[startup] AUTO_DB_INIT=false, skipping database initialization check.");
    return;
  }

  const { connection: connectionConfig, databaseName } = getDatabaseConfig();
  const connection = await mysql.createConnection(connectionConfig);

  try {
    const exists = await databaseExists(connection, databaseName);
    if (!exists) {
      console.log(`[startup] Database "${databaseName}" is missing. Creating database...`);
      try {
        await createDatabase(connection, databaseName);
      } catch (error) {
        throw formatDatabaseAccessError(error, databaseName);
      }
    }
  } finally {
    await connection.end();
  }

  let databaseConnection;
  try {
    databaseConnection = await mysql.createConnection({
      ...connectionConfig,
      database: databaseName
    });
  } catch (error) {
    throw formatDatabaseAccessError(error, databaseName);
  }

  try {
    const tableNames = await getTableNames(databaseConnection, databaseName);
    if (tableNames.size === 0) {
      console.log(`[startup] Database "${databaseName}" is empty. Initializing schema and seed data...`);
      await runSqlFile(databaseConnection, "schema.sql", databaseName, true);
      await runSqlFile(databaseConnection, "seed.sql", databaseName, true);
      console.log(`[startup] Database "${databaseName}" initialized.`);
      return;
    }

    if (!hasRequiredTables(tableNames)) {
      throw new Error(
        `Database "${databaseName}" exists but is missing required tables. Run "npm run db:init" or apply a migration before starting the server.`
      );
    }

    console.log(`[startup] Database "${databaseName}" is ready.`);
  } finally {
    await databaseConnection.end();
  }
}

async function startServer() {
  const dev = process.env.NODE_ENV !== "production";
  const hostname = process.env.HOST || "0.0.0.0";
  const port = Number(process.env.PORT || 6000);

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  createServer((request, response) => {
    handle(request, response);
  }).listen(port, hostname, () => {
    console.log(`[startup] Server ready on http://${hostname}:${port}`);
  });
}

async function main() {
  process.env.NODE_ENV = process.env.NODE_ENV || "production";

  await loadRuntimeModules();
  await loadEnvFile(".env");
  validateStartupEnv();
  await ensureDatabase();
  await loadNextModule();
  await startServer();
}

main().catch((error) => {
  console.error("[startup] Failed to start application:");
  console.error(error);
  process.exit(1);
});
