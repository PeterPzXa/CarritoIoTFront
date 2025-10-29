// js/sockets.js
import { WS_URL, DEVICE_ID } from "./config.js";

let socket = null;

export function connectSockets() {
  if (socket) return socket;

  socket = io(WS_URL, { transports: ["websocket"] });

  socket.on("connect", () => {
    console.log("🟢 WS conectado:", socket.id);
    socket.emit("join_device", { device_id: DEVICE_ID });
  });

  socket.on("disconnect", () => console.log("🔴 WS desconectado"));

  return socket;
}

// Suscriptores
export function onMovement(cb) { connectSockets().on("movement:new", cb); }
export function onObstacle(cb) { connectSockets().on("obstacle:new", cb); }
export function onDemoRun(cb)  { connectSockets().on("demo:run:new", cb); }
