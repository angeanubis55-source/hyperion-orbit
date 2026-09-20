"use strict";

import { register, login, getCurrentUserPublic, findLocalUserForMigration } from "../SRC/CORE/ACCOUNT.js";
import { serverOnline, apiRegister, apiLogin } from "../SRC/CORE/ACCOUNT_NET.js";

const $ = (id) => document.getElementById(id);

// Elements
const tabLogin = $("tabLogin");
const tabJoin = $("tabJoin");
const formLogin = $("formLogin");
const formJoin = $("formJoin");
const msgEl = $("msg");

// Login fields
const loginUser = $("loginUser");
const loginPass = $("loginPass");
const rememberMe = $("rememberMe");

// Register fields
const regUser = $("regUser");
const regEmail = $("regEmail");
const regPass = $("regPass");
const regPass2 = $("regPass2");
const factionChoices = [...document.querySelectorAll('input[name="regFaction"]')];

function showMsg(text, ok) {
  msgEl.textContent = text || "";
  msgEl.className = "msg " + (ok ? "ok" : "err");
}

function goProfile() {
  location.href = "/index.html";
}

// Check if already logged in
const cur = getCurrentUserPublic();
if (cur) goProfile();

// Multi : serveur de comptes joignable ? (sinon 100 % local comme avant)
let netServer = false;
try {
  showMsg("Connexion…", true);
  netServer = await serverOnline(1500);
  showMsg(netServer ? "Mode en ligne : comptes sur le serveur." : "Mode local : serveur injoignable.", netServer);
  setTimeout(() => { if (!msgEl.textContent.startsWith("⚠️") && !msgEl.textContent.startsWith("❌")) { msgEl.textContent = ""; msgEl.className = "msg"; } }, 2500);
} catch {
  netServer = false;
}

// Tab switching
function setTab(which) {
  const isLogin = which === "login";
  tabLogin.classList.toggle("active", isLogin);
  tabJoin.classList.toggle("active", !isLogin);
  formLogin.classList.toggle("hidden", !isLogin);
  formJoin.classList.toggle("hidden", isLogin);
  msgEl.className = "msg";
  msgEl.textContent = "";

  setTimeout(() => {
    (isLogin ? loginUser : regUser)?.focus();
  }, 0);
}

tabLogin.addEventListener("click", () => setTab("login"));
tabJoin.addEventListener("click", () => setTab("join"));

// Password toggle helper
function attachToggle(btnId, inputId, eyeOnId, eyeOffId) {
  const btn = $(btnId);
  const input = $(inputId);
  const eyeOn = $(eyeOnId);
  const eyeOff = $(eyeOffId);

  if (!btn || !input || !eyeOn || !eyeOff) return;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const hidden = input.type === "password";
    input.type = hidden ? "text" : "password";
    eyeOn.style.display = hidden ? "none" : "block";
    eyeOff.style.display = hidden ? "block" : "none";
    input.focus();
  });
}

attachToggle("toggleLoginPass", "loginPass", "eyeLoginOpen", "eyeLoginOff");
attachToggle("toggleRegPass", "regPass", "eyeRegOpen", "eyeRegOff");
attachToggle("toggleRegPass2", "regPass2", "eyeReg2Open", "eyeReg2Off");

// Remember me functionality
const REMEMBER_KEY = "hyperion_orbit_remember_user";
try {
  const remembered = localStorage.getItem(REMEMBER_KEY);
  if (remembered) {
    loginUser.value = remembered;
    if (rememberMe) rememberMe.checked = true;
  }
} catch {}

// LOGIN
$("btnLogin").addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    const pseudo = loginUser.value.trim();
    const password = loginPass.value;

    if (!pseudo || !password) {
      showMsg("⚠️ Remplis pseudo et mot de passe", false);
      return;
    }

    if (netServer) {
      showMsg("Connexion au serveur…", true);
      $("btnLogin").disabled = true;
      try {
        const out = await apiLogin(pseudo, password);
        if (!out || out.ok === false) {
          showMsg(out?.error || "❌ Échec de connexion", false);
          return;
        }
        try {
          if (rememberMe && rememberMe.checked) localStorage.setItem(REMEMBER_KEY, pseudo);
          else localStorage.removeItem(REMEMBER_KEY);
        } catch {}
        showMsg("✅ Session active - Bienvenue pilote! (En ligne)", true);
        setTimeout(goProfile, 800);
      } finally {
        $("btnLogin").disabled = false;
      }
      return;
    }

    const out = login(pseudo, password);
    if (!out || out.ok === false) {
      showMsg(out?.error || "❌ Échec de connexion", false);
      return;
    }

    try {
      if (rememberMe && rememberMe.checked) localStorage.setItem(REMEMBER_KEY, pseudo);
      else localStorage.removeItem(REMEMBER_KEY);
    } catch {}

    showMsg("✅ Session active - Bienvenue pilote!", true);
    setTimeout(goProfile, 800);
  } catch (e) {
    console.error(e);
    showMsg(e?.message || "❌ Erreur de connexion", false);
  }
});

// REGISTER
$("btnRegister").addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    const pseudo = regUser.value.trim();
    const email = regEmail.value.trim();
    const p1 = regPass.value;
    const p2 = regPass2.value;
    const faction = factionChoices.find(input => input.checked)?.value || "";

    if (!pseudo || !email || !p1 || !p2 || !faction) {
      showMsg("⚠️ Tous les champs sont requis", false);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) {
      showMsg("⚠️ Entre une adresse email valide", false);
      return;
    }
    if (p1.length < 4) {
      showMsg("⚠️ Mot de passe trop court (min. 4)", false);
      return;
    }
    if (p1 !== p2) {
      showMsg("⚠️ Les mots de passe ne correspondent pas", false);
      return;
    }

    if (netServer) {
      showMsg("Création du compte sur le serveur…", true);
      $("btnRegister").disabled = true;
      try {
        // Migration unique : progression locale reprise si meme pseudo.
        let migrate = null;
        try { migrate = findLocalUserForMigration(pseudo); } catch {}
        if (migrate && String(migrate.email || "").trim().toLowerCase() !== email.trim().toLowerCase()) migrate = null;
        const out = await apiRegister({ pseudo, email, password: p1, faction, migrate });
        if (!out || out.ok === false) {
          showMsg(out?.error || "❌ Échec de création", false);
          return;
        }
        showMsg(migrate ? "✅ Compte créé - progression locale importée! (En ligne)" : "✅ Compte pilote créé - Session active! (En ligne)", true);
        setTimeout(goProfile, 800);
      } finally {
        $("btnRegister").disabled = false;
      }
      return;
    }

    const out = register({
      pseudo,
      email,
      password: p1,
      faction,
    });

    if (!out || out.ok === false) {
      showMsg(out?.error || "❌ Échec de création", false);
      return;
    }

    showMsg("✅ Compte pilote créé - Session active!", true);
    setTimeout(goProfile, 800);
  } catch (e) {
    console.error(e);
    showMsg(e?.message || "❌ Erreur d'inscription", false);
  }
});

// Enter key shortcuts
loginPass.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("btnLogin").click();
  }
});

regPass2.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("btnRegister").click();
  }
});
