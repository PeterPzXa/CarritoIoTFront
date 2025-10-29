// js/demo.js
import { DEVICE_ID, DEFAULT_TZ } from "./config.js";
import { createDemo, getLast20Demo, launchDemo, repeatDemo } from "./api.js";
import { connectSockets, onDemoRun } from "./sockets.js";
import { toast } from "./ui.js";

const tzBadge     = document.getElementById("tzBadge");
const deviceBadge = document.getElementById("deviceBadge");
const wsBadge     = document.getElementById("wsBadge");

const stepStatus   = document.getElementById("stepStatus");
const stepDuration = document.getElementById("stepDuration");
const stepSpeed    = document.getElementById("stepSpeed");
const stepWait     = document.getElementById("stepWait");
const btnAddStep   = document.getElementById("btnAddStep");
const btnClear     = document.getElementById("btnClearSteps");
const btnCreate    = document.getElementById("btnCreateDemo");
const stepsBody    = document.getElementById("stepsBody");

const seqName      = document.getElementById("seqName");
const repeatCount  = document.getElementById("repeatCount");
const programmedBy = document.getElementById("programmedBy");

const btnReloadDemo = document.getElementById("btnReloadDemo");
const demoBody      = document.getElementById("demoBody");
const liveInfo      = document.getElementById("liveInfo");

// ---------- estado local ----------
let steps = []; // {status_id, duration_ms, speed, wait_ms}

const fmt = (v) => v ?? "—";
const asTime = (iso) => {
  try { return new Date(iso).toLocaleString(); }
  catch { return iso || "—"; }
};

function renderSteps() {
  stepsBody.innerHTML = "";
  steps.forEach((s, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${fmt(s.status_id)}</td>
      <td>${fmt(s.duration_ms)}</td>
      <td>${fmt(s.speed)}</td>
      <td>${fmt(s.wait_ms)}</td>
      <td><button class="btn btn-sm btn-outline-danger" data-idx="${i}">✕</button></td>
    `;
    stepsBody.appendChild(tr);
  });
}

function clearSteps() {
  steps = [];
  renderSteps();
}

btnAddStep.addEventListener("click", () => {
  const st = Number(stepStatus.value);
  const du = Number(stepDuration.value);
  const sp = Number(stepSpeed.value);
  const wa = Number(stepWait.value);
  if (Number.isNaN(st)) return toast("Movimiento inválido","danger");
  steps.push({ status_id: st, duration_ms: du, speed: sp, wait_ms: wa });
  renderSteps();
});

stepsBody.addEventListener("click", (e) => {
  const idx = e.target?.dataset?.idx;
  if (idx !== undefined) {
    steps.splice(Number(idx), 1);
    renderSteps();
  }
});

btnClear.addEventListener("click", clearSteps);

btnCreate.addEventListener("click", async () => {
  if (!seqName.value.trim()) return toast("Pon un nombre a la secuencia","warning");
  if (steps.length === 0)    return toast("Agrega al menos 1 paso","warning");

  const payload = {
    device_id: DEVICE_ID,
    seq_name: seqName.value.trim(),
    programmed_by: programmedBy.value.trim() || "admin",
    repeat_count: Number(repeatCount.value || 1),
    steps: steps
  };

  try {
    btnCreate.disabled = true;
    const res = await createDemo(payload);
    toast("DEMO creada ✅","success");
    await reloadDemo();
    clearSteps();
  } catch (err) {
    console.error(err);
    toast("Error al crear DEMO","danger");
  } finally {
    btnCreate.disabled = false;
  }
});

async function reloadDemo() {
  demoBody.innerHTML = "";
  try {
    const res = await getLast20Demo();
    (res.data || []).forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fmt(row.sequence_id ?? row.id)}</td>
        <td>${fmt(row.seq_name || row.name || "DEMO")}</td>
        <td>${asTime(row.created_at)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-success" data-launch="${row.sequence_id ?? row.id}">Lanzar</button>
          <button class="btn btn-sm btn-outline-secondary ms-1" data-repeat="${row.last_run_id ?? ""}" ${row.last_run_id ? "" : "disabled"}>Repetir</button>
        </td>
      `;
      demoBody.appendChild(tr);
    });
  } catch (e) {
    console.error(e);
  }
}

demoBody.addEventListener("click", async (e) => {
  const sid = e.target?.dataset?.launch;
  const rid = e.target?.dataset?.repeat;

  if (sid) {
    try {
      e.target.disabled = true;
      await launchDemo(Number(sid));
      toast(`DEMO ${sid} lanzada ▶️`,"success");
    } catch (err) {
      console.error(err);
      toast("Error al lanzar DEMO","danger");
    } finally {
      e.target.disabled = false;
    }
  }

  if (rid) {
    try {
      e.target.disabled = true;
      await repeatDemo(Number(rid));
      toast(`DEMO repetida (run ${rid}) 🔁`,"success");
    } catch (err) {
      console.error(err);
      toast("Error al repetir DEMO","danger");
    } finally {
      e.target.disabled = false;
    }
  }
});

// ---------- sockets ----------
function attachWS() {
  const socket = connectSockets();
  wsBadge.textContent = "WS: Conectando…";
  socket.on("connect", () => wsBadge.textContent = "WS: Conectado");
  socket.on("disconnect", () => wsBadge.textContent = "WS: Desconectado");

  onDemoRun((m) => {
    liveInfo.style.display = "block";
    liveInfo.textContent = `▶️ DEMO run: ${JSON.stringify(m)}`;
    // También puedes refrescar la lista si el backend llena last_run_id
    // reloadDemo();
  });
}

// ---------- init ----------
(async function init(){
  tzBadge.textContent = DEFAULT_TZ;
  deviceBadge.textContent = `Device ${DEVICE_ID}`;
  await reloadDemo();
  attachWS();
})();
