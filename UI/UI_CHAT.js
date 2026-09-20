"use strict";

import { drainNetChatInbox, sendChat, netMyId, netMyPseudo, netplayStatus } from "../SRC/CORE/NETPLAY.js";
import { escapeHtml } from "./UI_DOM.js";

const MAX_SHOWN = 60;
let started = false;

function fmtTime(at) {
  try {
    const d = new Date(Number(at) || Date.now());
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  } catch { return ""; }
}

export function initChatUI() {
  if (started) return;
  started = true;
  const entries = document.getElementById("chatEntries");
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSend");
  const status = document.getElementById("chatStatus");
  if (!entries || !form || !input) return;

  let shown = 0;
  let online = true;

  function setOnline(v) {
    if (v === online) return;
    online = v;
    if (status) {
      status.textContent = v ? "Connecté" : "Hors ligne (serveur injoignable)";
      status.classList.toggle("offline", !v);
    }
  }

  function appendMessage(m) {
    // L'id serveur change a chaque refresh : pour l'historique on se
    // reconnait aussi par le pseudo (stable).
    const mine = (m.by && m.by === netMyId()) || (m.from && netMyPseudo() && m.from === netMyPseudo());
    const row = document.createElement("div");
    row.className = "chatRow" + (mine ? " chatMine" : "") + (m.from === "[ADMIN]" ? " chatAdmin" : "");
    row.innerHTML = `<span class="chatTime">${escapeHtml(fmtTime(m.at))}</span> <span class="chatFrom">${escapeHtml(m.from)}</span><span class="chatSep"> : </span><span class="chatText">${escapeHtml(m.text)}</span>`;
    entries.appendChild(row);
    while (entries.children.length > MAX_SHOWN) entries.removeChild(entries.firstChild);
  }

  function poll() {
    try {
      const st = netplayStatus();
      setOnline(!!st.connected);
      if (!st.connected && shown === 0) return;
      const inbox = drainNetChatInbox();
      if (!inbox.length) return;
      const empty = entries.querySelector(".chatEmpty");
      if (empty) empty.remove();
      for (const m of inbox) appendMessage(m);
      shown += inbox.length;
      entries.scrollTop = entries.scrollHeight;
    } catch {}
  }

  function submit() {
    const text = input.value.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!text) return;
    if (!sendChat(text)) {
      if (status) {
        status.textContent = "Hors ligne : message non envoyé";
        status.classList.add("offline");
      }
      return;
    }
    input.value = "";
    input.focus();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    e.stopPropagation();
    submit();
  });
  sendBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    submit();
  });

  setInterval(poll, 250);
  poll();
}
