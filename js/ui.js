// js/ui.js
export function toast(msg, type="info") {
  console.log(`[${type.toUpperCase()}]`, msg);
}

export function setText(el, text) {
  if (!el) return;
  el.textContent = text ?? "—";
}

export function buttonBusy(btn, busy=true) {
  if (!btn) return;
  btn.disabled = !!busy;
  btn.dataset.originalText ||= btn.textContent;
  btn.textContent = busy ? "Enviando..." : btn.dataset.originalText;
}
