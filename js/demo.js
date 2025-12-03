// js/demo.js
import { DEVICE_ID, DEFAULT_TZ } from "./config.js";
import { createDemo, getLast20Demo, launchDemo, repeatDemo } from "./api.js";
import { connectSockets, onDemoRun } from "./sockets.js";
import { toast } from "./ui.js";

const tzBadge     = document.getElementById("tzBadge");
const deviceBadge = document.getElementById("deviceBadge");
const wsBadge     = document.getElementById("wsBadge");

// Constructor de pasos
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

// Tabla de últimas DEMOs
const btnReloadDemo = document.getElementById("btnReloadDemo");
const demoBody      = document.getElementById("demoBody");

// Panel de ejecución
const demoSelector  = document.getElementById("demoSelector");
const btnExecOnce   = document.getElementById("btnExecOnce");
const btnExecLoop   = document.getElementById("btnExecLoop");   // puede ser null
const execProgress  = document.getElementById("execProgress");
const execBar       = execProgress?.querySelector(".progress-bar");

// Info en vivo
const liveInfo        = document.getElementById("liveInfo");
const liveInfoContent = document.getElementById("liveInfoContent");

// ---------- estado local ----------
let steps = [];      // {status_id, duration_ms, speed, wait_ms}
let demoList = [];   // cache de las demos que trae getLast20Demo()

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

// ---------- render de pasos ----------
function renderSteps() {
  stepsBody.innerHTML = "";
  steps.forEach((s, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${fmt(s.status_id)}</td>
      <td>${fmt(s.duration_ms)}</td>
      <td>${fmt(s.speed)}</td>
      <td>${fmt(s.wait_ms)}</td>
      <td><button class="btn btn-sm btn-outline-danger" data-idx="${i}">✕</button></td>
    `;
    stepsBody.appendChild(tr);
  });

  if (steps.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td colspan="6" class="text-center text-muted py-1">
        <i class="fas fa-plus-circle me-2"></i>Agrega el primer paso para comenzar
      </td>
    `;
    stepsBody.appendChild(tr);
  }
}

function clearSteps() {
  steps = [];
  renderSteps();
}

// ---------- eventos de constructor ----------
btnAddStep?.addEventListener("click", () => {
  const st = Number(stepStatus.value);
  const du = Number(stepDuration.value);
  const sp = Number(stepSpeed.value);
  const wa = Number(stepWait.value);

  if (Number.isNaN(st)) {
    return toast("Movimiento inválido", "danger");
  }

  steps.push({
    status_id: st,
    duration_ms: du,
    speed: sp,
    wait_ms: wa,
  });

  renderSteps();
});

stepsBody?.addEventListener("click", (e) => {
  const idx = e.target?.dataset?.idx;
  if (idx !== undefined) {
    steps.splice(Number(idx), 1);
    renderSteps();
  }
});

btnClear?.addEventListener("click", clearSteps);

btnCreate?.addEventListener("click", async () => {
  if (!seqName.value.trim()) {
    return toast("Pon un nombre a la secuencia", "warning");
  }
  if (steps.length === 0) {
    return toast("Agrega al menos 1 paso", "warning");
  }

  const payload = {
    device_id: DEVICE_ID,
    seq_name: seqName.value.trim(),
    programmed_by: programmedBy.value.trim() || "admin",
    repeat_count: Number(repeatCount.value || 1),
    steps: steps,
  };

  try {
    btnCreate.disabled = true;
    const res = await createDemo(payload);   // usa la API /api/demo/create
    console.log("createDemo result:", res);
    toast("DEMO creada ✅", "success");
    await reloadDemo();
    clearSteps();
  } catch (err) {
    console.error(err);
    toast("Error al crear DEMO", "danger");
  } finally {
    btnCreate.disabled = false;
  }
});

// ---------- carga de últimas DEMOs ----------
async function reloadDemo() {
  demoBody.innerHTML = "";
  demoSelector.innerHTML = `<option value="">-- Selecciona una secuencia --</option>`;

  try {
    const res = await getLast20Demo();  // usa /api/demo/last-20
    demoList = res.data || [];

    demoList.forEach((row) => {
      const seqId   = row.sequence_id ?? row.id;
      const name    = row.seq_name || row.name || `DEMO ${seqId}`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fmt(seqId)}</td>
        <td>${fmt(name)}</td>
        <td>${asTime(row.created_at)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-success" data-launch="${seqId}">
            Lanzar
          </button>
        </td>
      `;
      demoBody.appendChild(tr);

      const opt = document.createElement("option");
      opt.value = String(seqId);
      opt.textContent = name;
      demoSelector.appendChild(opt);
    });
  } catch (e) {
    console.error(e);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td colspan="4" class="text-center text-danger py-1">
        Error al cargar DEMOs
      </td>
    `;
    demoBody.appendChild(tr);
  }
}

btnReloadDemo?.addEventListener("click", reloadDemo);

// Botón "Lanzar" en la tabla de últimas DEMOs
demoBody?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const sid = btn.dataset.launch;
  const rid = btn.dataset.repeat;

  if (sid) {
    // Lanza DEMO usando la MISMA API que el panel de ejecución
    try {
      btn.disabled = true;
      await launchDemo(Number(sid));   // /api/demo/launch
      toast(`DEMO ${sid} lanzada ▶️`, "success");
      await reloadDemo();
    } catch (err) {
      console.error(err);
      toast("Error al lanzar DEMO", "danger");
    } finally {
      btn.disabled = false;
    }
    return;
  }

  if (rid) {
    try {
      btn.disabled = true;
      await repeatDemo(Number(rid));   // /api/demo/repeat
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

// ---------- panel Ejecutar Secuencia ----------
btnExecOnce?.addEventListener("click", async () => {
  const val = demoSelector.value;
  if (!val) {
    return toast("Selecciona una DEMO primero", "warning");
  }

  const seqId = Number(val);
  if (!seqId) {
    return toast("ID de DEMO inválido", "danger");
  }

  try {
    // 🔧 AQUI estaba el error: btnExecLoop puede ser null
    btnExecOnce.disabled = true;
    if (btnExecLoop) btnExecLoop.disabled = true;

    if (execProgress && execBar) {
      execProgress.style.display = "block";
      execBar.style.width = "10%";
    }

    // MISMO endpoint que la tabla: /api/demo/launch
    await launchDemo(seqId);
    toast(`DEMO ${seqId} lanzada ▶️`, "success");

    if (execBar) {
      execBar.style.width = "100%";
      setTimeout(() => {
        if (execProgress && execBar) {
          execBar.style.width = "0%";
          execProgress.style.display = "none";
        }
      }, 1000);
    }

    await reloadDemo();
  } catch (err) {
    console.error(err);
    toast("Error al lanzar DEMO desde panel Ejecutar Secuencia", "danger");
  } finally {
    btnExecOnce.disabled = false;
    if (btnExecLoop) btnExecLoop.disabled = false;
  }
});

// Si en un futuro agregas el botón de loop, este código ya está listo
btnExecLoop?.addEventListener("click", async () => {
  const val = demoSelector.value;
  if (!val) {
    return toast("Selecciona una DEMO primero", "warning");
  }

  const seqId = Number(val);
  if (!seqId) {
    return toast("ID de DEMO inválido", "danger");
  }

  toast("Modo bucle aún no implementado; se ejecutará una vez", "info");

  try {
    btnExecOnce.disabled = true;
    btnExecLoop.disabled = true;
    await launchDemo(seqId);
    toast(`DEMO ${seqId} lanzada (modo bucle placeholder) ▶️`, "success");
    await reloadDemo();
  } catch (err) {
    console.error(err);
    toast("Error al lanzar DEMO en bucle", "danger");
  } finally {
    btnExecOnce.disabled = false;
    btnExecLoop.disabled = false;
  }
});

// ---------- sockets & WS badge ----------
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

  setWsStatus("connecting");

  if (socket.connected) {
    setWsStatus("connected");
  }

  socket.on("connect", () => {
    setWsStatus("connected");
  });

  socket.on("disconnect", () => {
    setWsStatus("disconnected");
  });

  // Evento demo:run desde el backend
  onDemoRun(async (m) => {
    if (liveInfo) liveInfo.style.display = "block";
    if (liveInfoContent) {
      liveInfoContent.textContent = `▶️ Ejecutando: ${m.seq_name ?? "DEMO"} (run ${m.run_id})`;
    }
    await reloadDemo();
  });
}

// ---------- init ----------
(async function init() {
  if (tzBadge) tzBadge.textContent = DEFAULT_TZ;
  if (deviceBadge) deviceBadge.textContent = `Device ${DEVICE_ID}`;

  renderSteps();
  await reloadDemo();
  attachWS();
})();
