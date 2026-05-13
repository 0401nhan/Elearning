import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { queryRows } from "@/lib/db";

export async function GET() {
  try {
    const rows = await queryRows<(RowDataPacket & { ok: number })[]>("SELECT 1 AS ok");
    return NextResponse.json({ ok: rows[0]?.ok === 1 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Database connection failed" },
      { status: 500 }
    );
  }
}
