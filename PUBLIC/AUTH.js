"use strict";

import { getCurrentUserPublic, findLocalUserForMigration } from "../SRC/CORE/ACCOUNT.js";
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
const recoveryPanel = $("recoveryPanel");
const recoveryTitle = $("recoveryTitle");
const recoveryHint = $("recoveryHint");
const recoveryEmail = $("recoveryEmail");
const recoveryEmailFields = $("recoveryEmailFields");
const resetPasswordFields = $("resetPasswordFields");
const recoverySubmit = $("recoverySubmit");
let recoveryMode = "";
let recoveryToken = "";

function showMsg(text, ok) {
  msgEl.textContent = text || "";
  msgEl.className = "msg " + (ok ? "ok" : "err");
}

function goProfile() {
  location.href = "/index.html";
}

async function publicAuthApi(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  return { status: response.status, ...(await response.json().catch(() => ({}))) };
}

function openRecovery(mode, token = "") {
  recoveryMode = mode;
  recoveryToken = token;
  recoveryPanel?.classList.remove("hidden");
  const reset = mode === "reset";
  recoveryEmailFields?.classList.toggle("hidden", reset);
  resetPasswordFields?.classList.toggle("hidden", !reset);
  recoveryTitle.textContent = mode === "username" ? "Nom d'utilisateur oublié"
    : reset ? "Choisir un nouveau mot de passe" : "Mot de passe oublié";
  recoveryHint.textContent = mode === "username"
    ? "Indique l'adresse email du compte : son nom d'utilisateur y sera envoyé."
    : reset ? "Le lien est valable une heure et ne peut être utilisé qu'une fois."
      : "Un lien sécurisé de réinitialisation sera envoyé à l'adresse du compte.";
  recoverySubmit.textContent = reset ? "Réinitialiser le mot de passe" : "Envoyer l'email";
  setTimeout(() => (reset ? $("resetPassword") : recoveryEmail)?.focus(), 0);
}

function closeRecovery() {
  recoveryPanel?.classList.add("hidden");
  recoveryMode = "";
  recoveryToken = "";
}

// Check if already logged in
const cur = getCurrentUserPublic();
if (cur) goProfile();

// Multi : serveur de comptes joignable ? (sinon 100 % local comme avant)
let netServer = false;
try {
  showMsg("Connexion…", true);
  netServer = await serverOnline(1500);
  showMsg(netServer ? "Mode en ligne : comptes sur le serveur." : "Serveur injoignable. Connexion impossible.", netServer);
  $("btnLogin").disabled = !netServer;
  $("btnRegister").disabled = !netServer;
  setTimeout(() => { if (!msgEl.textContent.startsWith("⚠️") && !msgEl.textContent.startsWith("❌")) { msgEl.textContent = ""; msgEl.className = "msg"; } }, 2500);
} catch {
  netServer = false;
  $("btnLogin").disabled = true;
  $("btnRegister").disabled = true;
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
  closeRecovery();

  setTimeout(() => {
    (isLogin ? loginUser : regUser)?.focus();
  }, 0);
}

tabLogin.addEventListener("click", () => setTab("login"));
tabJoin.addEventListener("click", () => setTab("join"));
$("forgotUsername")?.addEventListener("click", () => openRecovery("username"));
$("forgotPassword")?.addEventListener("click", () => openRecovery("password"));
$("recoveryClose")?.addEventListener("click", closeRecovery);

recoverySubmit?.addEventListener("click", async () => {
  recoverySubmit.disabled = true;
  try {
    if (recoveryMode === "reset") {
      const password = $("resetPassword")?.value || "";
      if (password.length < 10) return showMsg("Mot de passe trop court (10 caractères minimum).", false);
      if (password !== ($("resetPasswordConfirm")?.value || "")) return showMsg("Les mots de passe ne correspondent pas.", false);
      const out = await publicAuthApi("/api/auth/reset-password", { token: recoveryToken, password });
      showMsg(out.message || out.error || "Réinitialisation impossible.", out.ok === true);
      if (out.ok) { history.replaceState({}, "", location.pathname); closeRecovery(); }
      return;
    }
    const email = recoveryEmail?.value.trim() || "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) return showMsg("Entre une adresse email valide.", false);
    const path = recoveryMode === "username" ? "/api/auth/forgot-username" : "/api/auth/forgot-password";
    const out = await publicAuthApi(path, { email });
    showMsg(out.message || out.error || "Demande envoyée.", out.ok === true);
  } catch { showMsg("Erreur réseau. Réessaie plus tard.", false); }
  finally { recoverySubmit.disabled = false; }
});

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

    if (!netServer) {
      showMsg("Serveur injoignable. Connexion impossible.", false);
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
    if (p1.length < 10) {
      showMsg("⚠️ Mot de passe trop court (min. 10)", false);
      return;
    }
    if (p1 !== p2) {
      showMsg("⚠️ Les mots de passe ne correspondent pas", false);
      return;
    }

    if (!netServer) {
      showMsg("Serveur injoignable. Inscription impossible.", false);
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
        if (out.pendingVerification) {
          setTab("login");
          showMsg(out.message || "Compte créé. Confirme ton inscription avec l'email reçu.", true);
          return;
        }
        showMsg(migrate ? "Compte créé - progression locale importée !" : "Compte pilote créé - session active !", true);
        setTimeout(goProfile, 800);
      } finally {
        $("btnRegister").disabled = false;
      }
      return;
    }

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

// Les liens d'activation et de réinitialisation reviennent sur cette page.
try {
  const query = new URLSearchParams(location.search);
  const verifyToken = query.get("verify");
  const resetToken = query.get("reset");
  if (verifyToken) {
    const out = await publicAuthApi("/api/auth/verify-email", { token: verifyToken });
    setTab("login");
    showMsg(out.message || out.error || "Confirmation impossible.", out.ok === true);
    history.replaceState({}, "", location.pathname);
  } else if (resetToken) {
    setTab("login");
    openRecovery("reset", resetToken);
  }
} catch { showMsg("Lien invalide ou service indisponible.", false); }
