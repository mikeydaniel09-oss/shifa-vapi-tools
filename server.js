const express = require("express");
const app = express();

// helpful logs if anything crashes
process.on("unhandledRejection", e => console.error("UNHANDLED REJECTION:", e));
process.on("uncaughtException",  e => console.error("UNCAUGHT EXCEPTION:", e));

// parsers
app.use(express.json({ limit: "50kb", type: "*/*" }));
app.use(express.urlencoded({ extended: true }));

// health checks (Render may ping this)
app.get("/", (_req, res) => res.status(200).send("✅ timenow endpoint running"));
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

function getTimeData(tz = "America/Chicago") {
  const now = new Date();
  const pretty = {
    timeZone: tz, hour12: true,
    weekday: "short", year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  };
  const dateOnly = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  const time24  = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).format(now);

  return {
    ok: true,
    timezone_requested: tz,
    iso_utc: now.toISOString(),
    unix_ms: now.getTime(),
    local_pretty: new Intl.DateTimeFormat("en-US", pretty).format(now),
    parts: { date: dateOnly, time_24h: time24 }
  };
}

// accept GET or POST
app.all("/timenow", (req, res) => {
  try {
    let tz = req.query.timezone || (req.body && (req.body.timezone || req.body.tz)) || "America/Chicago";
    if (typeof tz !== "string" || !tz.includes("/")) tz = "America/Chicago";
    return res.status(200).json(getTimeData(tz));
  } catch (err) {
    console.error("timenow error:", err);
    return res.status(200).json({ ok: true, fallback: "Unexpected error; returning UTC.", ...getTimeData("UTC") });
  }
});

// IMPORTANT for Render: use provided port and bind to all interfaces
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`⏰ timenow running on :${PORT}`));
