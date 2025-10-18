import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { v4 as uuid } from "uuid";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// --- Mock DB (swap for real DB later) ---
const db = {
  patients: {},       // key: phone/email/name → record
  appointments: {},   // id → { id, slot, patientId, reason, contact }
  slots: [
    mkSlot("s1", "Dr. Khan", "telehealth", 24),
    mkSlot("s2", "PA Malik", "in_person", 48),
    mkSlot("s3", "Dr. Khan", "telehealth", 72),
    mkSlot("s4", "NP Ortiz", "telehealth", 96)
  ],
  tickets: []         // refill/voicemail tickets
};

function mkSlot(id, provider, mode, startInHours) {
  const start = new Date(Date.now() + startInHours * 3600 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { id, provider, mode, start: start.toISOString(), end: end.toISOString() };
}

const ok   = (tool, result) => ({ tool, result });
const fail = (tool, message, code = 400) => ({ tool, error: { message, code } });

app.get("/", (_req, res) => res.send("Shifa Vapi Tools OK"));

// Single endpoint for all tools
app.post("/vapi/tools", async (req, res) => {
  try {
    const tool = req.body?.name;
    const args = req.body?.arguments || {};

    switch (tool) {
      // ---- Appointments ----
      case "appt.search": {
        const { provider, mode, after, before } = args;
        const out = db.slots.filter((s) =>
          (!provider || s.provider === provider) &&
          (!mode || s.mode === mode) &&
          (!after || s.start >= after) &&
          (!before || s.end <= before)
        );
        return res.json(ok(tool, out));
      }

      case "appt.book": {
        const { patientId, slotId, reason, contact } = args;
        const slot = db.slots.find((s) => s.id === slotId);
        if (!slot) return res.json(fail(tool, "Slot not found", 404));
        const appointmentId = uuid();
        db.appointments[appointmentId] = { id: appointmentId, slot, patientId, reason, contact };
        return res.json(ok(tool, { appointmentId, slot }));
      }

      case "appt.modify": {
        const { appointmentId, action, newSlotId } = args;
        const appt = db.appointments[appointmentId];
        if (!appt) return res.json(fail(tool, "Appointment not found", 404));

        if (action === "cancel") {
          delete db.appointments[appointmentId];
          return res.json(ok(tool, { cancelled: true }));
        }
        if (action === "reschedule") {
          const ns = db.slots.find((s) => s.id === newSlotId);
          if (!ns) return res.json(fail(tool, "New slot not found", 404));
          appt.slot = ns;
          return res.json(ok(tool, { appointmentId, slot: ns }));
        }
        return res.json(fail(tool, "Invalid action"));
      }

      // ---- Intake ----
      case "intake.save": {
        const rec = { id: uuid(), ...args, createdAt: new Date().toISOString() };
        const key = (rec.phone || rec.email || rec.name || rec.id).toLowerCase();
        db.patients[key] = rec;
        return res.json(ok(tool, { patientId: rec.id }));
      }

      // ---- Insurance ----
      case "insurance.verify": {
        const { carrier, memberId } = args;
        const eligible = !!(carrier && memberId) && String(memberId).length >= 6;
        return res.json(ok(tool, { eligible, copayEstimate: eligible ? 35 : null }));
      }

      // ---- Refills ----
      case "refill.create": {
        const ticket = {
          id: uuid(),
          type: "refill",
          status: "open",
          createdAt: new Date().toISOString(),
          ...args
        };
        db.tickets.push(ticket);
        return res.json(ok(tool, ticket));
      }

      // ---- Messages ----
      case "message.send": {
        const { to, channel, body } = args;
        // Stub: print to logs. Later integrate Twilio/SendGrid using env vars.
        console.log(`[MSG:${channel}] → ${to}: ${body}`);
        return res.json(ok(tool, { queued: true }));
      }

      // ---- Emergency Transfer ----
      case "emergency.transfer": {
        const { target, phone } = args;
        const forwardedTo =
          target === "988" ? (process.env.CRISIS_988 || "+18002738255")
          : target === "911" ? "911"
          : phone || null;
        if (!forwardedTo) return res.json(fail(tool, "No target number"));
        return res.json(ok(tool, { forwardedTo }));
      }

      // ---- Voicemail ----
      case "voicemail.save": {
        const { caller, audioUrl, transcript } = args;
        const note = { id: uuid(), caller, audioUrl, transcript, createdAt: new Date().toISOString() };
        db.tickets.push({ ...note, type: "voicemail" });
        return res.json(ok(tool, note));
      }

      default:
        return res.json(fail("unknown", `Unknown tool: ${tool}`, 404));
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: { message: e.message } });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Shifa Vapi Tools listening on ${port}`));
