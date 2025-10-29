// js/control.js
import { DEVICE_ID, DEFAULT_TZ } from "./config.js";
import { postMovement, getLastMovement, getLastObstacle, postObstacle } from "./api.js";
import { onMovement, onObstacle, connectSockets } from "./sockets.js";
import { setText, buttonBusy, toast } from "./ui.js";

const lastStatusEl = document.getElementById("lastStatus");
const obstacleEl   = document.getElementById("obstacleStatus");
const tempBtn      = document.getElementById("btnObstacleTemp");
const tzBadge      = document.getElementById("tzBadge");
const deviceBadge  = document.getElementById("deviceBadge");

// Inicial
(async function init(){
  tzBadge.textContent = DEFAULT_TZ;
  deviceBadge.textContent = `Device ${DEVICE_ID}`;

  try {
    const lm = await getLastMovement(DEVICE_ID);
    setText(lastStatusEl, lm?.data?.[0]?.status_text || "—");
  } catch(e){ /* vacío */ }

  try {
    const lo = await getLastObstacle(DEVICE_ID);
    setText(obstacleEl, lo?.data?.[0]?.status_text || "NINGUNO");
  } catch(e){ /* vacío */ }

  // WS
  connectSockets();
  onMovement((msg)=> setText(lastStatusEl, msg?.status_text ?? "—"));
  onObstacle((msg)=> setText(obstacleEl, msg?.status_text ?? "NINGUNO"));
})();

// Mapeo de botones -> status_id
document.querySelectorAll(".action-btn").forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    const status = Number(btn.dataset.status);
    try{
      buttonBusy(btn, true);
      await postMovement({ device_id: DEVICE_ID, status_id: status, notes: btn.textContent.trim() });
      btn.classList.add("btn-success");
      setTimeout(() => btn.classList.remove("btn-success"), 500);
      toast("Movimiento enviado","success");
    }catch(err){
      console.error(err);
      toast("Error al enviar movimiento","danger");
    }finally{
      buttonBusy(btn, false);
    }
  });
});

// Botón temporal de obstáculo (usa status_id=5 Retrocede por defecto)
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

// REFRESH AUTOMATICO DE STATUS
async function autoRefresh() {
  try {
    const lastMov = await getLastMovement(DEVICE_ID);
    setText(lastStatusEl, lastMov?.data?.[0]?.status_text ?? "—");

    const lastObst = await getLastObstacle(DEVICE_ID);
    setText(obstacleEl, lastObst?.data?.[0]?.status_text ?? "NINGUNO");

  } catch (err) {
    console.warn("⚠️ Auto-refresh control error:", err);
  }
}

// Ejecutar cada 4 segundos
setInterval(autoRefresh, 10000);

