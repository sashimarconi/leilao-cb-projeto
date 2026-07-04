import { Router, Request } from "express";
import { Pool } from "pg";

const router = Router();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket?.remoteAddress || req.ip || "";
}

// ─── GET /api/block/check ─────────────────────────────────────────────────────

router.get("/check", async (req, res) => {
  const ip = getClientIp(req);
  try {
    const result = await pool.query(
      "SELECT 1 FROM blocked_ips WHERE ip = $1 LIMIT 1",
      [ip]
    );
    res.json({ blocked: result.rowCount! > 0, ip });
  } catch {
    res.json({ blocked: false, ip });
  }
});

// ─── POST /api/block/register ─────────────────────────────────────────────────

router.post("/register", async (req, res) => {
  const ip = getClientIp(req);
  try {
    await pool.query(
      "INSERT INTO blocked_ips (ip) VALUES ($1) ON CONFLICT (ip) DO NOTHING",
      [ip]
    );
    res.json({ ok: true, ip });
  } catch {
    res.json({ ok: false, ip });
  }
});

export default router;
