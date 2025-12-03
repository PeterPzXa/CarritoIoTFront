// js/monitor.js — WS push only (sin polling) + métricas con ÚLTIMO ID
import { DEVICE_ID, DEFAULT_TZ } from "./config.js";
import { getLastMovements, getLastObstacles } from "./api.js";
import { connectSockets, onMovement, onObstacle } from "./sockets.js";

const tzBadge     = document.getElementById("tzBadge");
const deviceBadge = document.getElementById("deviceBadge");
const wsBadge     = document.getElementById("wsBadge");

const tblMovsBody = document.querySelector("#tblMovs tbody");
const tblObstBody = document.querySelector("#tblObst tbody");

const btnReloadMovs = document.getElementById("btnReloadMovs");
const btnReloadObst = document.getElementById("btnReloadObst");

// -------- utilidades ----------
const fmt = (v) => v ?? "—";
const pickTime = (o) => o?.occurred_at ?? o?.event_at ?? o?.created_at ?? null;

// Convierte un string de la API (UTC) a Date real en UTC
function parseUtc(iso) {
  if (!iso) return null;
  let s = String(iso);

  // "2025-11-17 19:16:42" -> "2025-11-17T19:16:42"
  if (!s.includes("T") && s.includes(" ")) {
    s = s.replace(" ", "T");
  }

  // Si no trae zona horaria (+hh:mm o Z), asumimos que viene en UTC
  if (!/[zZ]|[+\-]\d{2}:?\d{2}$/.test(s)) {
    s += "Z";
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Formatea para mostrar en tu zona horaria (America/Mexico_City)
const asTime = (iso) => {
  const d = parseUtc(iso);
  if (!d) return iso || "—";

  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: DEFAULT_TZ,
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
};

const pickStatus = (o) => o?.status_text ?? o?.status_texto ?? "—";

// -------- tablas ----------
function removePlaceholder(tbody) {
  const first = tbody?.rows?.[0];
  if (!first) return;
  // si es la fila de "Cargando datos..." (colspan 4 / spinner)
  const isPlaceholder =
    first.cells?.length === 1 &&
    (first.cells[0].colSpan >= 3 || first.cells[0].innerText.toLowerCase().includes("cargando"));
  if (isPlaceholder) tbody.deleteRow(0);
}

function prependRow(tbody, cells, max = 5) {
  removePlaceholder(tbody);
  const tr = document.createElement("tr");
  tr.innerHTML = cells.map(c => `<td>${c}</td>`).join("");
  tbody.prepend(tr);
  while (tbody.rows.length > max) tbody.deleteRow(-1);
}

// -------- estado de métricas ----------
// Ahora usamos el ÚLTIMO ID en cada tarjeta
let lastMovId  = 0;
let lastObstId = 0;
let firstTimestamp = null;
let lastActivityTs = null;

function paintMetrics() {
  // Tarjetas de arriba: último ID
  document.getElementById("totalMovements").textContent = lastMovId || 0;
  document.getElementById("totalObstacles").textContent = lastObstId || 0;

  document.getElementById("lastActivity").textContent =
    lastActivityTs ? lastActivityTs.toLocaleString() : "—";

  if (firstTimestamp) {
    const ms = Date.now() - firstTimestamp.getTime();
    const h = Math.floor(ms / (1000 * 60 * 60));
    const m = Math.floor((ms / (1000 * 60)) % 60);
    document.getElementById("uptime").textContent = `${h}h ${m}m`;
  } else {
    document.getElementById("uptime").textContent = "0h";
  }

  // contadores visibles de las tablas (cuántas filas se muestran)
  document.getElementById("movCount").textContent  = tblMovsBody?.rows?.length ?? 0;
  document.getElementById("obstCount").textContent = tblObstBody?.rows?.length ?? 0;
}

// Recalcula métricas con la carga inicial desde la API
function recalcMetricsOnInitial(movs, obsts) {
  // sacamos el máximo ID de cada lista
  lastMovId = movs.reduce((max, m) => {
    const id = Number(m.move_id ?? m.id ?? 0);
    return isNaN(id) ? max : Math.max(max, id);
  }, 0);

  lastObstId = obsts.reduce((max, o) => {
    const id = Number(o.obst_id ?? o.id ?? 0);
    return isNaN(id) ? max : Math.max(max, id);
  }, 0);

  const allTimes = [
    ...movs.map(pickTime).filter(Boolean),
    ...obsts.map(pickTime).filter(Boolean),
  ].sort();

  firstTimestamp = allTimes[0] ? parseUtc(allTimes[0]) : null;
  lastActivityTs = allTimes.length ? parseUtc(allTimes[allTimes.length - 1]) : null;
  paintMetrics();
}

// Actualiza métricas cada vez que llega un evento nuevo por WS
function bumpMetricsOnEvent(tsIso, kind, idRaw) {
  const idNum = Number(idRaw ?? 0);

  if (kind === "mov" && !isNaN(idNum)) {
    if (idNum > lastMovId) lastMovId = idNum;
  }
  if (kind === "obst" && !isNaN(idNum)) {
    if (idNum > lastObstId) lastObstId = idNum;
  }

  const ts = tsIso ? parseUtc(tsIso) : new Date();
  if (!firstTimestamp || ts < firstTimestamp) firstTimestamp = ts;
  if (!lastActivityTs || ts > lastActivityTs) lastActivityTs = ts;

  paintMetrics();
}

// -------- carga inicial (UNA VEZ) ----------
async function loadInitial() {
  tzBadge.textContent = DEFAULT_TZ;
  deviceBadge.textContent = `Device ${DEVICE_ID}`;

  const movsRes = await getLastMovements(DEVICE_ID, 5);
  const obstRes = await getLastObstacles(DEVICE_ID, 5);
  const movs = movsRes.data || [];
  const obsts = obstRes.data || [];

  // La API ya viene en DESC → la invertimos para que el prepend deje la tabla en DESC
  const movsOrdered  = [...movs].reverse();
  const obstsOrdered = [...obsts].reverse();

  movsOrdered.forEach((r) => {
    const t = pickTime(r);
    prependRow(tblMovsBody, [fmt(r.move_id), pickStatus(r), asTime(t), fmt(r.notes)]);
  });
  obstsOrdered.forEach((r) => {
    const t = pickTime(r);
    prependRow(tblObstBody, [fmt(r.obst_id), pickStatus(r), asTime(t), fmt(r.details)]);
  });

  recalcMetricsOnInitial(movs, obsts);
}

// -------- WebSocket ----------
function setWsStatus(state) {
  if (!wsBadge) return;

  wsBadge.classList.remove("text-bg-secondary", "text-bg-success", "text-bg-danger");

  if (state === "connecting") {
    wsBadge.classList.add("text-bg-secondary");
    wsBadge.innerHTML = '<i class="fas fa-signal me-1"></i>WS: Conectado';
  } else if (state === "connected") {
    wsBadge.classList.add("text-bg-success");
    wsBadge.innerHTML = '<i class="fas fa-signal me-1"></i>WS: Conectado';
  } else {
    wsBadge.classList.add("text-bg-danger");
    wsBadge.innerHTML = '<i class="fas fa-signal me-1"></i>WS: Desconectado';
  }
}

function attachWS() {
  const socket = connectSockets();

  // estado inicial
  setWsStatus("connecting");
  console.log("🟢 Conectando WS desde monitor.js.");

  // 🔥 IMPORTANTE: si ya estaba conectado ANTES de registrar los eventos
  if (socket.connected) {
    console.log("✅ Socket ya estaba conectado cuando entró attachWS");
    setWsStatus("connected");
  }

  socket.on("connect", () => {
    console.log("✅ Evento connect capturado en monitor.js");
    setWsStatus("connected");
  });

  socket.on("disconnect", () => {
    console.log("⚠️ Evento disconnect capturado en monitor.js");
    setWsStatus("disconnected");
  });

  socket.on("connect_error", (err) => {
    console.error("❌ connect_error en monitor.js:", err);
    setWsStatus("disconnected");
  });

  if (socket.io) {
    socket.io.on("reconnect_attempt", () => {
      console.log("↻ Intentando reconectar WS…");
      setWsStatus("connecting");
    });
    socket.io.on("reconnect_failed", () => {
      console.log("❌ Falló la reconexión WS");
      setWsStatus("disconnected");
    });
  }

  // Suscriptores de eventos en vivo
  onMovement((m) => {
    try {
      const list = Array.isArray(m) ? m : [m];
      list.forEach((item) => {
        console.log("💡 Recibido movement:new", item);
        const t  = pickTime(item);
        const id = item.move_id ?? item.event_id;
        prependRow(
          tblMovsBody,
          [fmt(id), pickStatus(item), asTime(t), fmt(item.notes ?? item.detalles ?? item.details)]
        );
        bumpMetricsOnEvent(t, "mov", id);
      });
    } catch (e) {
      console.error("paint movement error:", e, m);
    }
  });

  onObstacle((o) => {
    try {
      const list = Array.isArray(o) ? o : [o];
      list.forEach((item) => {
        console.log("🚧 Recibido obstacle:new", item);
        const t  = pickTime(item);
        const id = item.obst_id ?? item.event_id;
        prependRow(
          tblObstBody,
          [fmt(id), pickStatus(item), asTime(t), fmt(item.details ?? item.detalle ?? item.notes)]
        );
        bumpMetricsOnEvent(t, "obst", id);
      });
    } catch (e) {
      console.error("paint obstacle error:", e, o);
    }
  });
}

// -------- recarga manual (opcional) ----------
async function reloadMovs() {
  tblMovsBody.innerHTML = "";

  const movs = (await getLastMovements(DEVICE_ID, 5)).data || [];
  const movsOrdered = [...movs].reverse();

  movsOrdered.forEach((r) => {
    const t = pickTime(r);
    prependRow(tblMovsBody, [fmt(r.move_id), pickStatus(r), asTime(t), fmt(r.notes)]);
  });

  // sólo actualizamos contadores visibles
  paintMetrics();
}

async function reloadObst() {
  tblObstBody.innerHTML = "";

  const obst = (await getLastObstacles(DEVICE_ID, 5)).data || [];
  const obstOrdered = [...obst].reverse();

  obstOrdered.forEach((r) => {
    const t = pickTime(r);
    prependRow(tblObstBody, [fmt(r.obst_id), pickStatus(r), asTime(t), fmt(r.details)]);
  });

  paintMetrics();
}

btnReloadMovs?.addEventListener("click", reloadMovs);
btnReloadObst?.addEventListener("click", reloadObst);

// -------- init ----------
loadInitial().then(() => {
  attachWS();
});
