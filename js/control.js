// js/control.js — WS push only (sin polling)
import { DEVICE_ID, DEFAULT_TZ } from "./config.js";
import { postMovement, getLastMovement, getLastObstacle, postObstacle } from "./api.js";
import { onMovement, onObstacle, connectSockets } from "./sockets.js";
import { setText, buttonBusy, toast } from "./ui.js";

const lastStatusEl = document.getElementById("lastStatus");
const obstacleEl   = document.getElementById("obstacleStatus");
const tempBtn      = document.getElementById("btnObstacleTemp");
const tzBadge      = document.getElementById("tzBadge");
const deviceBadge  = document.getElementById("deviceBadge");

const speedRange   = document.getElementById("speedRange");
const speedLabel   = document.getElementById("speedLabel");

// Inicializa etiqueta de velocidad
if (speedRange && speedLabel) {
  speedLabel.textContent = speedRange.value;

  speedRange.addEventListener("input", () => {
    speedLabel.textContent = speedRange.value;
  });
}


// Init (carga una vez; luego TODO por WS)
(async function init(){
  tzBadge.textContent = DEFAULT_TZ;
  deviceBadge.textContent = `Device ${DEVICE_ID}`;

  try {
    const lm = await getLastMovement(DEVICE_ID);
    setText(lastStatusEl, lm?.data?.[0]?.status_text ?? lm?.data?.[0]?.status_texto ?? "—");
  } catch {}

  try {
    const lo = await getLastObstacle(DEVICE_ID);
    setText(obstacleEl, lo?.data?.[0]?.status_text ?? lo?.data?.[0]?.status_texto ?? "NINGUNO");
  } catch {}

  // Conecta WS y escucha eventos en vivo
  connectSockets();
  onMovement((msg)=> {
    const st = msg?.status_text ?? msg?.status_texto ?? "—";
    setText(lastStatusEl, st);
  });
  onObstacle((msg)=> {
    const st = msg?.status_text ?? msg?.status_texto ?? "NINGUNO";
    setText(obstacleEl, st);
  });
})();

// Botonera -> POST; el monitor/control se actualiza por WS
async function sendMovement(statusId, btn) {
  const speed = speedRange ? Number(speedRange.value) : null;
  const notes = speed ? String(speed) : ""; // 👈 aquí va la velocidad en notes

  try {
    if (btn) buttonBusy(btn, true);

    await postMovement({
      device_id: DEVICE_ID,
      status_id: statusId,
      client_id: null,
      notes       // "200", "210", etc.
    });

    toast(`Movimiento ${statusId} enviado a velocidad ${notes}`, "success");
  } catch (err) {
    console.error(err);
    toast("Error al enviar movimiento", "danger");
  } finally {
    if (btn) buttonBusy(btn, false);
  }
}

// Listeners de los botones de movimiento (HTML usa data-status)
document.querySelectorAll("[data-status]").forEach(btn => {
  btn.addEventListener("click", () => {
    const statusId = Number(btn.dataset.status);
    if (!statusId) return;
    sendMovement(statusId, btn);
  });
});



// Botón temporal de obstáculo
tempBtn?.addEventListener("click", async ()=>{
  try{
    buttonBusy(tempBtn, true);
    await postObstacle({ device_id: DEVICE_ID, status_id: 5, details: "Simulación (botón temporal)" });
    toast("Obstáculo simulado","warning");
  }catch(err){
    console.error(err);
    toast("Error al simular obstáculo","danger");
  }finally{
    buttonBusy(tempBtn, false);
  }
});
