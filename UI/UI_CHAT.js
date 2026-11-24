"use strict";
import { shouldRefreshWindow, isWindowShown } from "../SRC/CORE/BACKGROUND_REFRESH.js";

import { drainNetChatInbox, sendChat, sendWhisper, sendClanChat, netMyId, netMyPseudo, netplayStatus } from "../SRC/CORE/NETPLAY.js";
import { escapeHtml } from "./UI_DOM.js";

const MAX_SHOWN = 60;
// Sélecteur d'emojis du chat (insérés à la position du curseur).
const CHAT_EMOJIS = [
  "😀","😁","😂","🤣","😊","😉","😍","😘","😎","🤩","😇","🥳",
  "🙂","🙃","😏","😅","😬","🤔","🤨","😐","🙄","😴","🤤","😮",
  "😢","😭","😡","🤬","😱","😳","🥺","🤯","🤮","🤡","💀","👻",
  "👍","👎","👌","✌️","🤞","👏","🙏","💪","👋","🤝","🫡","🖕",
  "❤️","💔","🔥","⭐","✨","💥","💯","💰","💎","🎁","🎉","🏆",
  "🚀","🛸","🌌","🪐","☄️","⚔️","🛡️","🎯","💣","⚡","☠️","👑",
];
let started = false;

function fmtTime(at) {
  try {
    const d = new Date(Number(at) || Date.now());
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  } catch { return ""; }
}

function initEmojiPicker(input) {
  const btn = document.getElementById("chatEmojiBtn");
  const picker = document.getElementById("chatEmojiPicker");
  if (!btn || !picker) return;
  const frag = document.createDocumentFragment();
  for (const emoji of CHAT_EMOJIS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = emoji;
    b.dataset.emoji = emoji;
    b.setAttribute("translate", "no");
    frag.appendChild(b);
  }
  picker.appendChild(frag);
  const setOpen = (open) => {
    picker.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  };
  const insert = (emoji) => {
    const max = Number(input.maxLength) > 0 ? Number(input.maxLength) : 200;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = input.value.slice(0, start) + emoji + input.value.slice(end);
    if (next.length > max) return;
    input.value = next;
    const caret = start + emoji.length;
    input.focus();
    try { input.setSelectionRange(caret, caret); } catch {}
  };
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(picker.hidden);
  });
  // mousedown bloqué : l'input garde le focus et la position du curseur.
  picker.addEventListener("mousedown", (e) => e.preventDefault());
  picker.addEventListener("click", (e) => {
    const emoji = e.target?.closest?.("button[data-emoji]")?.dataset.emoji;
    if (!emoji) return;
    e.preventDefault();
    e.stopPropagation();
    insert(emoji);
  });
  document.addEventListener("pointerdown", (e) => {
    if (picker.hidden) return;
    if (picker.contains(e.target) || btn.contains(e.target)) return;
    setOpen(false);
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !picker.hidden) setOpen(false);
  });
  input.form?.addEventListener("submit", () => setOpen(false));
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
  initEmojiPicker(input);

  let shown = 0;
  let online = true;
  let onlineNeedsRender = false;
  let pendingMessages = [];
  // Pastille « nouveau message » sur le bouton Chat du dock : allumée quand
  // un message arrive fenêtre fermée, éteinte une fois la fenêtre ouverte et
  // lue jusqu'en bas. Attribut sur <html> : survit au re-rendu du dock.
  // L'historique rejoué à la connexion (messages d'avant le chargement)
  // ne l'allume pas.
  const loadedAt = Date.now();
  let unread = false;
  function setUnread(v) {
    if (v === unread) return;
    unread = v;
    document.documentElement.toggleAttribute("data-chat-unread", v);
  }
  function chatReadToBottom() {
    return isWindowShown("chatWindow") && entries.scrollHeight - entries.scrollTop - entries.clientHeight < 24;
  }
  function isMine(m) {
    return (m.by && m.by === netMyId()) || (m.from && netMyPseudo() && m.from === netMyPseudo());
  }
  entries.addEventListener("scroll", () => { if (unread && chatReadToBottom()) setUnread(false); }, { passive: true });

  function setOnline(v) {
    if (v === online && !onlineNeedsRender) return;
    online = v;
    if (!shouldRefreshWindow("chatWindow")) { onlineNeedsRender = true; return; }
    onlineNeedsRender = false;
    if (status) {
      status.textContent = v ? "Connecté" : netplayStatus()?.sessionReplaced ? "Session ouverte ailleurs" : "Hors ligne (serveur injoignable)";
      status.classList.toggle("offline", !v);
    }
  }

  function appendMessage(m) {
    // L'id serveur change a chaque refresh : pour l'historique on se
    // reconnait aussi par le pseudo (stable).
    const mine = isMine(m);
    const row = document.createElement("div");
    row.className = "chatRow" + (mine ? " chatMine" : "") + (m.from === "[ADMIN]" ? " chatAdmin" : "");
    row.setAttribute("translate", "no");
    row.innerHTML = `<span class="chatTime">${escapeHtml(fmtTime(m.at))}</span> <span class="chatFrom">${escapeHtml(m.from)}</span><span class="chatSep"> : </span><span class="chatText">${escapeHtml(m.text)}</span>`;
    entries.appendChild(row);
    while (entries.children.length > MAX_SHOWN) entries.removeChild(entries.firstChild);
  }

  function announceMessage(m) {
    // Annonce admin : bannière en jeu (au-dessus du toast de zone),
    // même en gate. Ignorée si vieille (> 60 s : rejeu d'historique).
    if (m.adminBlast === true && m.from === "[ADMIN]" && Date.now() - Number(m.at || 0) < 60000) {
      try { window.dispatchEvent(new CustomEvent("orbit:admin-announce", { detail: { text: String(m.text || "") } })); } catch {}
    }
  }

  function poll() {
    try {
      const st = netplayStatus();
      setOnline(!!st.connected);
      const received = drainNetChatInbox();
      for (const message of received) announceMessage(message);
      if (!isWindowShown("chatWindow") && received.some((m) => !isMine(m) && Number(m.at || Date.now()) >= loadedAt - 60000)) setUnread(true);
      pendingMessages = pendingMessages.concat(received).slice(-MAX_SHOWN);
      if (shouldRefreshWindow("chatWindow") && pendingMessages.length) {
        const inbox = pendingMessages;
        pendingMessages = [];
        const empty = entries.querySelector(".chatEmpty");
        if (empty) empty.remove();
        for (const m of inbox) appendMessage(m);
        shown += inbox.length;
        entries.scrollTop = entries.scrollHeight;
      }
      if (unread && chatReadToBottom()) setUnread(false);
    } catch {}
  }

  function submit() {
    const text = input.value.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!text) return;
    // Murmure façon DarkOrbit : /w pseudo message.
    const whisper = /^\/w\s+(\S+)\s+([\s\S]+)$/.exec(text);
    if (whisper) {
      if (!sendWhisper(whisper[1], whisper[2])) {
        if (status) {
          status.textContent = "Hors ligne : murmure non envoyé";
          status.classList.add("offline");
        }
        return;
      }
      input.value = "";
      input.focus();
      return;
    }
    // Tchat de clan façon DarkOrbit : /c message.
    const clan = /^\/c\s+([\s\S]+)$/.exec(text);
    if (clan) {
      if (!sendClanChat(clan[1])) {
        if (status) {
          status.textContent = "Hors ligne ou sans clan : message non envoyé";
          status.classList.add("offline");
        }
        return;
      }
      input.value = "";
      input.focus();
      return;
    }
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

  window.addEventListener("orbit:window-restoring", event => {
    if (event.detail?.id === "chatWindow") poll();
  });
  setInterval(poll, 250);
  poll();
}
