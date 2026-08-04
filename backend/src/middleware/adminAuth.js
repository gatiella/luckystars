import "dotenv/config";

export function adminAuth(req, res, next) {
  const secret = req.headers["x-admin-secret"];
  if (!process.env.ADMIN_SECRET) {
    return res.status(500).json({ error: "admin_secret_not_configured" });
  }
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}
