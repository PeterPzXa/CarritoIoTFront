// js/sockets.js — singleton + suscriptores (movement/obstacle/demo)
import { WS_URL, DEVICE_ID } from "./config.js";

let socket = null;

// Listas de callbacks registrados por otros módulos
const subs = {
  movement: /** @type {Array<(m:any)=>void>} */ ([]),
  obstacle: /** @type {Array<(o:any)=>void>} */ ([]),
  demoRun:  /** @type {Array<(d:any)=>void>} */ ([])
};

export function connectSockets() {
  if (socket && socket.connected) return socket;          // reutiliza si ya está
  if (socket) { try { socket.disconnect(); } catch {} }   // limpia restos si hubiera

  socket = io(WS_URL, { path: "/socket.io", transports: ["websocket"] });

  socket.on("connect", () => {
    console.log("🟢 WS conectado:", socket.id);
    // Únete siempre al room del device para recibir sus push
    socket.emit("join_device", { device_id: DEVICE_ID });
  });

  socket.on("disconnect", () => console.log("🔴 WS desconectado"));

  // ----- Reemisión a subs -----
  socket.on("movement:new", (m) => {
    console.log("🔔 sockets.js movement:new", m);
    subs.movement.forEach(cb => { try { cb(m); } catch(e) { console.error(e);} });
  });

  socket.on("obstacle:new", (o) => {
    console.log("🔔 sockets.js obstacle:new", o);
    subs.obstacle.forEach(cb => { try { cb(o); } catch(e) { console.error(e);} });
  });

  // Eventos de DEMO (backend emite 'demo:run:new' y 'demo:run:repeat')
  socket.on("demo:run:new", (d) => {
    console.log("🔔 sockets.js demo:run:new", d);
    subs.demoRun.forEach(cb => { try { cb({ type: "new", ...toObj(d) }); } catch(e) { console.error(e);} });
  });
  socket.on("demo:run:repeat", (d) => {
    console.log("🔔 sockets.js demo:run:repeat", d);
    subs.demoRun.forEach(cb => { try { cb({ type: "repeat", ...toObj(d) }); } catch(e) { console.error(e);} });
  });

  return socket;
}

function toObj(x) {
  if (x && typeof x === "object") return x;
  try { return JSON.parse(x); } catch { return { raw: x }; }
}

// Suscriptores públicos
export function onMovement(cb) { subs.movement.push(cb); connectSockets(); }
export function onObstacle(cb) { subs.obstacle.push(cb); connectSockets(); }
export function onDemoRun(cb)  { subs.demoRun.push(cb);  connectSockets(); }
