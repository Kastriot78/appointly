const { normalizeRole } = require("../utils/roleChecks");

const clients = new Map();
let heartbeatId = null;

function ensureHeartbeat() {
  if (heartbeatId) return;
  heartbeatId = setInterval(() => {
    for (const { res } of clients.values()) {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch {
        // ignore broken streams; close handlers remove them
      }
    }
  }, 25000);
}

function maybeStopHeartbeat() {
  if (clients.size > 0 || !heartbeatId) return;
  clearInterval(heartbeatId);
  heartbeatId = null;
}

function addBookingRealtimeClient({ res, user, workspaceId }) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  clients.set(id, {
    res,
    userId: String(user?._id || ""),
    role: normalizeRole(user?.role),
    workspaceId: String(workspaceId || "").trim(),
  });
  ensureHeartbeat();
  return () => {
    clients.delete(id);
    maybeStopHeartbeat();
  };
}

function shouldDeliverToClient(client, event) {
  if (!event) return false;
  const eventBusinessId = String(event.businessId || "");
  const eventCustomerId = String(event.customerId || "");

  if (client.role === "customer") {
    return Boolean(client.userId && eventCustomerId === client.userId);
  }
  if (client.role === "tenant" || client.role === "staff") {
    if (!eventBusinessId) return false;
    if (!client.workspaceId) return true;
    return client.workspaceId === eventBusinessId;
  }
  return false;
}

function emitBookingRealtimeEvent(event) {
  const payload = { ...event, sentAt: new Date().toISOString() };
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients.values()) {
    if (!shouldDeliverToClient(client, payload)) continue;
    try {
      client.res.write(data);
    } catch {
      // broken stream cleanup happens on close
    }
  }
}

module.exports = {
  addBookingRealtimeClient,
  emitBookingRealtimeEvent,
};
