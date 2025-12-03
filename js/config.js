// js/config.js
export const BASE_URL = "http://98.91.106.165:5500"; // <- cambia si es necesario
export const WS_URL   = `${BASE_URL}/ws`;
export const DEVICE_ID = 1;                           // id del dispositivo
export const DEFAULT_TZ = "America/Mexico_City";      // zona horaria para la API

// Utilidad: headers JSON
export const JSON_HEADERS = {
  "Content-Type": "application/json"
};
