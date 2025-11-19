import { DEVICE_ID, DEFAULT_TZ } from "./config.js";
import { createDemo, getLast20Demo, launchDemo, repeatDemo } from "./api.js";
import { connectSockets, onDemoRun } from "./sockets.js";
import { toast } from "./ui.js";

const tzBadge     = document.getElementById("tzBadge");
const deviceBadge = document.getElementById("deviceBadge");
const wsBadge     = document.getElementById("wsBadge");
const wsText      = document.getElementById("wsText");

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

const demoSelector  = document.getElementById("demoSelector");
const btnExecOnce   = document.getElementById("btnExecOnce");
const btnExecLoop   = document.getElementById("btnExecLoop");
const execProgress  = document.getElementById("execProgress");
const execBar       = execProgress?.querySelector(".progress-bar");

// ---------- estado local ----------
let steps = []; // {status_id, duration_ms, speed, wait_ms}
let demoList = []; // cache de las demos que trae getLast20Demo()

const fmt = (v) => v ?? "—";

function parseUtc(iso) {
  if (!iso) return null;
  let s = String(iso);

  if (!s.includes("T") && s.includes(" ")) {
    s = s.replace(" ", "T");
  }

  if (!/[zZ]|[+\-]\d{2}:?\d{2}$/.test(s)) {
    s += "Z";
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const asTime = (iso) => {
  const d = parseUtc(iso);
  if (!d) return iso || "—";

  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "short",
      timeStyle: "medium",
      timeZone: DEFAULT_TZ,
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
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
  demoSelector.innerHTML = `<option value="">-- Selecciona una secuencia --</option>`;
  try {
    const res = await getLast20Demo();
    demoList = res.data || [];

    demoList.forEach(row => {
      const seqId   = row.sequence_id ?? row.id;
      const seqName = row.seq_name || row.name || `DEMO ${seqId}`;

      // Intenta obtener el último run_id con distintos nombres posibles
      const lastRunId =
        row.last_run_id ??
        row.run_id ??
        (row.last_run && row.last_run.run_id) ??
        null;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fmt(seqId)}</td>
        <td>${fmt(seqName)}</td>
        <td>${asTime(row.created_at)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-success" data-launch="${seqId}">
            Lanzar
          </button>
        </td>
      `;
      demoBody.appendChild(tr);

      // Selector de Ejecutar Secuencia
      const opt = document.createElement("option");
      opt.value = String(seqId);
      opt.textContent = seqName;
      demoSelector.appendChild(opt);
    });
  } catch (e) {
    console.error(e);
  }
}


demoBody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const sid = btn.dataset.launch;
  const rid = btn.dataset.repeat;

  // Lanzar DEMO normal
  if (sid) {
    try {
      btn.disabled = true;
      await launchDemo(Number(sid));
      toast(`DEMO ${sid} lanzada ▶️`, "success");
      await reloadDemo();
    } catch (err) {
      console.error(err);
      toast("Error al lanzar DEMO", "danger");
    } finally {
      btn.disabled = false;
    }
    return; // ya manejamos este click
  }

  // Repetir último run
  if (rid) {
    try {
      btn.disabled = true;
      await repeatDemo(Number(rid));  // ← aquí se manda { run_id: X }
      toast(`DEMO repetida (run ${rid}) 🔁`, "success");
      await reloadDemo();
    } catch (err) {
      console.error(err);
      toast("Error al repetir DEMO", "danger");
    } finally {
      btn.disabled = false;
    }
  }
});


btnExecOnce?.addEventListener("click", async () => {
  const val = demoSelector.value;
  if (!val) {
    return toast("Selecciona una DEMO primero","warning");
  }
  const seqId = Number(val);
  if (!seqId) {
    return toast("ID de DEMO inválido","danger");
  }

  try {
    btnExecOnce.disabled = true;
    btnExecLoop.disabled = true;
    if (execProgress && execBar) {
      execProgress.style.display = "block";
      execBar.style.width = "10%";
    }

    await launchDemo(seqId);
    toast(`DEMO ${seqId} lanzada ▶️`,"success");

    // Pequeño efecto en barra de progreso (simulado)
    if (execBar) {
      execBar.style.width = "100%";
      setTimeout(() => {
        if (execProgress && execBar) {
          execBar.style.width = "0%";
          execProgress.style.display = "none";
        }
      }, 1000);
    }

    // Refrescar listado para que se actualice last_run_id
    await reloadDemo();
  } catch (err) {
    console.error(err);
    toast("Error al lanzar DEMO desde panel Ejecutar Secuencia","danger");
  } finally {
    btnExecOnce.disabled = false;
    btnExecLoop.disabled = false;
  }
});

btnExecLoop?.addEventListener("click", async () => {
  const val = demoSelector.value;
  if (!val) {
    return toast("Selecciona una DEMO primero","warning");
  }
  const seqId = Number(val);
  if (!seqId) {
    return toast("ID de DEMO inválido","danger");
  }

  toast("Modo bucle aún no implementado; se ejecutará una vez","info");

  try {
    btnExecOnce.disabled = true;
    btnExecLoop.disabled = true;
    await launchDemo(seqId);
    toast(`DEMO ${seqId} lanzada (modo bucle placeholder) ▶️`,"success");
    await reloadDemo();
  } catch (err) {
    console.error(err);
    toast("Error al lanzar DEMO en bucle","danger");
  } finally {
    btnExecOnce.disabled = false;
    btnExecLoop.disabled = false;
  }
});

// ---------- sockets ----------
function setWsStatus(state) {
  if (!wsBadge || !wsText) return;

  // Quitar colores anteriores
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

  socket.on("connect", () => {
    setWsStatus("connected");
  });

  socket.on("disconnect", () => {
    setWsStatus("disconnected");
  });

  onDemoRun(async (m) => {
    liveInfo.style.display = "block";
    liveInfo.textContent = `▶️ Ejecutando: ${m.seq_name ?? 'DEMO'} (run ${m.run_id})`;

    // Actualiza lista DEMO con su último run_id
    await reloadDemo();
  });
}

// ---------- init ----------
(async function init(){
  tzBadge.textContent = DEFAULT_TZ;
  deviceBadge.textContent = `Device ${DEVICE_ID}`;
  await reloadDemo();
  attachWS();
})();

