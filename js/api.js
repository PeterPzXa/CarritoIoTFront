// js/api.js
import { BASE_URL, JSON_HEADERS, DEFAULT_TZ } from "./config.js";

// js/api.js
async function handle(res) {
  const text = await res.text();                // lee SIEMPRE el body
  if (!res.ok) {
    console.error("API error body:", text);     // lo verás en consola del navegador
    throw new Error(`HTTP ${res.status}: ${text?.slice(0,300)}`);
  }
  if (!text) return null;
  try { 
    return JSON.parse(text);
  } catch (e) {
    console.error("JSON parse error:", e, text);
    throw new Error("Invalid JSON from API");
  }
  
}


// ===== Movements =====
export async function postMovement({ device_id, status_id, client_id = null, notes = null }) {
  const res = await fetch(`${BASE_URL}/api/movements`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ device_id, status_id, client_id, notes })
  });
  return handle(res);
}

export async function getLastMovement(device_id, tz = DEFAULT_TZ) {
  const res = await fetch(`${BASE_URL}/api/movements/last?device_id=${device_id}&tz=${encodeURIComponent(tz)}`);
  return handle(res);
}

export async function getLastMovements(device_id, limit = 10, tz = DEFAULT_TZ) {
  const res = await fetch(`${BASE_URL}/api/movements/last-n?device_id=${device_id}&limit=${limit}&tz=${encodeURIComponent(tz)}`);
  return handle(res);
}

// ===== Obstacles =====
export async function postObstacle({ device_id, status_id, client_id = null, details = null }) {
  const res = await fetch(`${BASE_URL}/api/obstacles`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ device_id, status_id, client_id, details })
  });
  return handle(res);
}

export async function getLastObstacle(device_id, tz = DEFAULT_TZ) {
  const res = await fetch(`${BASE_URL}/api/obstacles/last?device_id=${device_id}&tz=${encodeURIComponent(tz)}`);
  return handle(res);
}

export async function getLastObstacles(device_id, limit = 10, tz = DEFAULT_TZ) {
  const res = await fetch(`${BASE_URL}/api/obstacles/last-n?device_id=${device_id}&limit=${limit}&tz=${encodeURIComponent(tz)}`);
  return handle(res);
}

// ===== Demo =====
export async function createDemo(payload) {
  const res = await fetch(`${BASE_URL}/api/demo/create`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload)
  });
  return handle(res);
}

export async function getLast20Demo() {
  const res = await fetch(`${BASE_URL}/api/demo/last-20`);
  return handle(res);
}

export async function launchDemo(sequence_id) {
  const res = await fetch(`${BASE_URL}/api/demo/launch`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ sequence_id })
  });
  return handle(res);
}

export async function repeatDemo(run_id) {
  const res = await fetch(`${BASE_URL}/api/demo/repeat`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ run_id })
  });
  return handle(res);
}
