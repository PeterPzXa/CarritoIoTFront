// js/monitor.js — WS push only (sin polling)
import { DEVICE_ID, DEFAULT_TZ } from "./config.js";
import { getLastMovements, getLastObstacles } from "./api.js";
import { connectSockets, onMovement, onObstacle } from "./sockets.js";

const tzBadge     = document.getElementById("tzBadge");
const deviceBadge = document.getElementById("deviceBadge");
const wsBadge     = document.getElementById("wsBadge");
const wsText      = document.getElementById("wsText");

const tblMovsBody = document.querySelector("#tblMovs tbody");
const tblObstBody = document.querySelector("#tblObst tbody");

const btnReloadMovs = document.getElementById("btnReloadMovs");
const btnReloadObst = document.getElementById("btnReloadObst");

// -------- utilidades ----------
const fmt = (v) => v ?? "—";
const pickTime = (o) => o?.occurred_at ?? o?.event_at ?? o?.created_at ?? null;
const asTime = (iso) => { try { return iso ? new Date(iso).toLocaleString() : "—"; } catch { return iso || "—"; } };
const pickStatus = (o) => o?.status_text ?? o?.status_texto ?? "—";

// -------- Chart.js ----------
let chartMovs, chartObst;
function buildLineChart(ctx, label, color) {
  return new Chart(ctx, {
    type: "line",
    data: { labels: [], datasets: [{ label, data: [], borderColor: color, tension: 0.2 }] },
    options: { responsive: true, animation: false, scales: { x: { display: false } } }
  });
}
function prependChartPoint(chart, xLabel, yValue, max = 20) {
  chart.data.labels.unshift(xLabel);
  chart.data.datasets[0].data.unshift(yValue);
  if (chart.data.labels.length > max) { chart.data.labels.pop(); chart.data.datasets[0].data.pop(); }
  chart.update();
}

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

function prependRow(tbody, cells, max = 20) {
  removePlaceholder(tbody);
  const tr = document.createElement("tr");
  tr.innerHTML = cells.map(c => `<td>${c}</td>`).join("");
  tbody.prepend(tr);
  while (tbody.rows.length > max) tbody.deleteRow(-1);
}


// -------- estado de métricas ----------
let totalMovs = 0;
let totalObst = 0;
let firstTimestamp = null;
let lastActivityTs = null;

function paintMetrics() {
  document.getElementById('totalMovements').textContent = totalMovs;
  document.getElementById('totalObstacles').textContent = totalObst;
  document.getElementById('lastActivity').textContent =
    lastActivityTs ? lastActivityTs.toLocaleString() : "—";

  if (firstTimestamp) {
    const ms = Date.now() - firstTimestamp.getTime();
    const h = Math.floor(ms / (1000*60*60));
    const m = Math.floor((ms / (1000*60)) % 60);
    document.getElementById('uptime').textContent = `${h}h ${m}m`;
  } else {
    document.getElementById('uptime').textContent = "0h";
  }

  // contadores visibles de las tablas (top 20)
  document.getElementById('movCount').textContent  = Math.min(totalMovs, 20);
  document.getElementById('obstCount').textContent = Math.min(totalObst, 20);
}

function recalcMetricsOnInitial(movs, obsts) {
  totalMovs = movs.length;
  totalObst = obsts.length;

  const allTimes = [
    ...movs.map(pickTime).filter(Boolean),
    ...obsts.map(pickTime).filter(Boolean)
  ].sort();

  firstTimestamp = allTimes[0] ? new Date(allTimes[0]) : null;
  lastActivityTs = allTimes.length ? new Date(allTimes[allTimes.length - 1]) : null;
  paintMetrics();
}

function bumpMetricsOnEvent(tsIso, kind) {
  if (kind === "mov") totalMovs++;
  if (kind === "obst") totalObst++;

  const ts = tsIso ? new Date(tsIso) : new Date();
  if (!firstTimestamp || ts < firstTimestamp) firstTimestamp = ts;
  if (!lastActivityTs || ts > lastActivityTs) lastActivityTs = ts;
  paintMetrics();
}

// -------- carga inicial (UNA VEZ) ----------
async function loadInitial() {
  tzBadge.textContent = DEFAULT_TZ;
  deviceBadge.textContent = `Device ${DEVICE_ID}`;

  chartMovs = buildLineChart(document.getElementById("chartMovs"), "Movimientos", "#0d6efd");
  chartObst = buildLineChart(document.getElementById("chartObst"), "Obstáculos", "#dc3545");

  const movsRes = await getLastMovements(DEVICE_ID, 20);
  const obstRes = await getLastObstacles(DEVICE_ID, 20);
  const movs = movsRes.data || [];
  const obsts = obstRes.data || [];

  // La API ya viene en DESC → la invertimos para que el prepend deje la tabla en DESC
  const movsOrdered  = [...movs].reverse();
  const obstsOrdered = [...obsts].reverse();

  movsOrdered.forEach((r) => {
    const t = pickTime(r);
    prependRow(tblMovsBody, [fmt(r.move_id), pickStatus(r), asTime(t), fmt(r.notes)]);
    prependChartPoint(chartMovs, t, 1);
  });
  obstsOrdered.forEach((r) => {
    const t = pickTime(r);
    prependRow(tblObstBody, [fmt(r.obst_id), pickStatus(r), asTime(t), fmt(r.details)]);
    prependChartPoint(chartObst, t, 1);
  });

  recalcMetricsOnInitial(movs, obsts); // aquí puedes dejar movs/obsts originales


}

// -------- WebSocket ----------
function setWsStatus(state) {
  if (!wsBadge || !wsText) return;

  wsBadge.classList.remove("text-bg-secondary", "text-bg-success", "text-bg-danger");

  if (state === "connecting") {
    wsBadge.classList.add("text-bg-secondary");
    wsText.textContent = "WS: Conectando…";
  } else if (state === "connected") {
    wsBadge.classList.add("text-bg-success");
    wsText.textContent = "WS: Conectado";
  } else {
    wsBadge.classList.add("text-bg-danger");
    wsText.textContent = "WS: Desconectado";
  }
}

function attachWS() {
  const socket = connectSockets();
  setWsStatus("connecting");
  console.log("🟢 Conectando WS desde monitor.js.");

  socket.on("connect", () => {
    setWsStatus("connected");
  });

  socket.on("disconnect", () => {
    setWsStatus("disconnected");
  });

  onMovement((m) => {
    try {
      const list = Array.isArray(m) ? m : [m];
      list.forEach((item) => {
        console.log("💡 Recibido movement:new", item);
        const t = pickTime(item);
        prependRow(
          tblMovsBody,
          [fmt(item.move_id ?? item.event_id), pickStatus(item), asTime(t), fmt(item.notes ?? item.detalles ?? item.details)]
        );
        prependChartPoint(chartMovs, t, 1);
        bumpMetricsOnEvent(t, "mov");
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
        const t = pickTime(item);
        prependRow(
          tblObstBody,
          [fmt(item.obst_id ?? item.event_id), pickStatus(item), asTime(t), fmt(item.details ?? item.detalle ?? item.notes)]
        );
        prependChartPoint(chartObst, t, 1);
        bumpMetricsOnEvent(t, "obst");
      });
    } catch (e) {
      console.error("paint obstacle error:", e, o);
    }
  });
}



// -------- recarga manual (opcional) ----------
async function reloadMovs() {
  tblMovsBody.innerHTML = "";
  chartMovs.data.labels = [];
  chartMovs.data.datasets[0].data = [];
  chartMovs.update();

  const movs = (await getLastMovements(DEVICE_ID, 20)).data || [];

  // Igual que en loadInitial: invertimos para que con prepend quede DESC
  const movsOrdered = [...movs].reverse();

  movsOrdered.forEach((r) => {
    const t = pickTime(r);
    prependRow(tblMovsBody, [fmt(r.move_id), pickStatus(r), asTime(t), fmt(r.notes)]);
    prependChartPoint(chartMovs, t, 1);
  });
}

async function reloadObst() {
  tblObstBody.innerHTML = "";
  chartObst.data.labels = [];
  chartObst.data.datasets[0].data = [];
  chartObst.update();

  const obst = (await getLastObstacles(DEVICE_ID, 20)).data || [];

  const obstOrdered = [...obst].reverse();

  obstOrdered.forEach((r) => {
    const t = pickTime(r);
    prependRow(tblObstBody, [fmt(r.obst_id), pickStatus(r), asTime(t), fmt(r.details)]);
    prependChartPoint(chartObst, t, 1);
  });
}

btnReloadMovs?.addEventListener("click", reloadMovs);
btnReloadObst?.addEventListener("click", reloadObst);

// -------- init ----------
loadInitial().then(attachWS);
