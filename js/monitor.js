// js/monitor.js
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
const asTime = (iso) => {
  try { return new Date(iso).toLocaleString(); }
  catch { return iso || "—"; }
};

// -------- Chart.js ----------
let chartMovs, chartObst;

function buildLineChart(ctx, label, color) {
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label,
        data: [],
        borderColor: color,
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      animation: false,
      scales: { x: { display: false } }
    }
  });
}

function prependChartPoint(chart, xLabel, yValue, max = 20) {
  chart.data.labels.unshift(xLabel);
  chart.data.datasets[0].data.unshift(yValue);
  if (chart.data.labels.length > max) {
    chart.data.labels.pop();
    chart.data.datasets[0].data.pop();
  }
  chart.update();
}

// -------- tablas ----------
function prependRow(tbody, cells, max = 20) {
  const tr = document.createElement("tr");
  tr.innerHTML = cells.map(c => `<td>${c}</td>`).join("");
  tbody.prepend(tr);
  while (tbody.rows.length > max) tbody.deleteRow(-1);
}

// -------- carga inicial ----------
async function loadInitial() {
  tzBadge.textContent = DEFAULT_TZ;
  deviceBadge.textContent = `Device ${DEVICE_ID}`;

  // charts
  chartMovs = buildLineChart(document.getElementById("chartMovs"), "Movimientos", "#0d6efd");
  chartObst = buildLineChart(document.getElementById("chartObst"), "Obstáculos", "#dc3545");

  await reloadMovs();
  await reloadObst();
}

// -------- WebSocket ----------
function attachWS() {
  const socket = connectSockets();
  wsBadge.textContent = "WS: Conectando…";

  socket.on("connect", () => wsBadge.textContent = "WS: Conectado");
  socket.on("disconnect", () => wsBadge.textContent = "WS: Desconectado");

  onMovement((m) => {
    prependRow(tblMovsBody, [
      fmt(m.move_id), fmt(m.status_text), asTime(m.occurred_at), fmt(m.notes)
    ]);
    prependChartPoint(chartMovs, m.occurred_at, 1);
  });

  onObstacle((o) => {
    prependRow(tblObstBody, [
      fmt(o.obst_id), fmt(o.status_text), asTime(o.occurred_at), fmt(o.details)
    ]);
    prependChartPoint(chartObst, o.occurred_at, 1);
  });
}

// -------- recarga manual ----------
async function reloadMovs() {
  tblMovsBody.innerHTML = "";
  chartMovs.data.labels = [];
  chartMovs.data.datasets[0].data = [];
  chartMovs.update();

  const movs = await getLastMovements(DEVICE_ID, 20);
  (movs.data || []).forEach((r) => {
    prependRow(tblMovsBody, [
      fmt(r.move_id), fmt(r.status_text), asTime(r.occurred_at), fmt(r.notes)
    ]);
    prependChartPoint(chartMovs, r.occurred_at, 1);
  });
}

async function reloadObst() {
  tblObstBody.innerHTML = "";
  chartObst.data.labels = [];
  chartObst.data.datasets[0].data = [];
  chartObst.update();

  const obst = await getLastObstacles(DEVICE_ID, 20);
  (obst.data || []).forEach((r) => {
    prependRow(tblObstBody, [
      fmt(r.obst_id), fmt(r.status_text), asTime(r.occurred_at), fmt(r.details)
    ]);
    prependChartPoint(chartObst, r.occurred_at, 1);
  });
}

btnReloadMovs?.addEventListener("click", reloadMovs);
btnReloadObst?.addEventListener("click", reloadObst);



// === MÉTRICAS REAL TIME ===
async function refreshMetrics() {
  try {
    const movRes = await getLastMovements(DEVICE_ID, 9999);
    const obstRes = await getLastObstacles(DEVICE_ID, 9999);

    const movs = movRes.data || [];
    const obsts = obstRes.data || [];

    // Totales
    document.getElementById('totalMovements').textContent = movs.length;
    document.getElementById('totalObstacles').textContent = obsts.length;

    // Última actividad
    const lastMov  = movs.length ? movs[0] : null;
    const lastObst = obsts.length ? obsts[0] : null;

    const lastAct = [lastMov?.occurred_at, lastObst?.occurred_at]
      .filter(Boolean)
      .sort()
      .pop();

    document.getElementById('lastActivity').textContent =
      lastAct ? new Date(lastAct).toLocaleString() : "—";

    // Uptime (diferencia desde el primer registro)
    const oldest = [...movs.map(m=>m.occurred_at), ...obsts.map(o=>o.occurred_at)]
      .filter(Boolean)
      .sort()[0];

    if (oldest) {
      const ms = Date.now() - new Date(oldest);
      const h = Math.floor(ms / (1000*60*60));
      const m = Math.floor((ms / (1000*60)) % 60);
      document.getElementById('uptime').textContent = `${h}h ${m}m`;
    } else {
      document.getElementById('uptime').textContent = "0h";
    }

    // Contadores Live de tabla
    document.getElementById('movCount').textContent = movs.slice(0,20).length;
    document.getElementById('obstCount').textContent = obsts.slice(0,20).length;

  } catch (err) {
    console.error("⚠️ Error al refrescar métricas:", err);
  }
}

// -------- actualización automática ----------
function autoRefresh() {
  reloadMovs();
  reloadObst();
  console.log("🔄 Refrescando datos automáticamente...");
}
// refrescar cada 5 segundos
setInterval(autoRefresh, 10000);
// Ejecutar cada 5 segundos junto al resto del auto-refresh
setInterval(refreshMetrics, 5000);
refreshMetrics(); // Primer llamado inmediato

// -------- init ----------
loadInitial().then(attachWS);
