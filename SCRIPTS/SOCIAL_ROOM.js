// SCRIPTS/SOCIAL_ROOM.js — Groupes (escadrilles) + murmures inter-joueurs.
// Groupes éphémères cross-map (max 5, leader = créateur) + chat de groupe.
// Les amis persistants vivent dans ACCOUNT_SERVER.js (table friends) ;
// ici : invites, membership, relais des messages. Le câblage réseau
// (lookup par pseudo, envoi ciblé) est injecté par MULTI_SERVER.js.
//
// Contexte attendu :
//   {
//     id, state, authed,
//     send(obj),                    // -> ce socket
//     sendTo(pid, obj),             // -> un pilote (room ou instance)
//     findByPseudo(pseudo),         // -> { id, pseudo } | null (connecté)
//     describe(pid),                // -> { id, pseudo, map } | null
//     onGroupChanged(memberIds),    // hook optionnel (ex : resync)
//   }

const GROUP_MAX = 10;
const INVITE_TTL_MS = 60_000;
const WHISPER_MIN_MS = 800;
const GROUP_CHAT_MIN_MS = 500;

let nextGroup = 1;
const groups = new Map(); // gid -> { id, leader, members: [pid], created }
const memberGroup = new Map(); // pid -> gid
const invites = new Map(); // targetPid -> { gid, from, fromPseudo, at }
const whisperLast = new Map(); // pid -> timestamp
const groupChatLast = new Map(); // pid -> timestamp

const cleanPseudo = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 20);

function publicGroup(gid, ctx) {
  const g = groups.get(gid);
  if (!g) return null;
  return {
    id: gid,
    leader: String(g.leader),
    members: g.members.map((pid) => {
      const d = ctx.describe(pid) || {};
      return { id: String(pid), pseudo: cleanPseudo(d.pseudo) || "Pilote", map: String(d.map || ""), online: !!d.online };
    }),
  };
}

function pushGroup(gid, ctx, extra = {}) {
  const pub = publicGroup(gid, ctx);
  const g = groups.get(gid);
  if (!g) return;
  for (const pid of g.members) {
    try { ctx.sendTo(pid, { t: "groupUpdate", group: pub, ...extra }); } catch {}
  }
}

function leaveGroup(pid, ctx) {
  const gid = memberGroup.get(pid);
  if (!gid) return false;
  const g = groups.get(gid);
  if (!g) { memberGroup.delete(pid); return false; }
  g.members = g.members.filter((m) => String(m) !== String(pid));
  memberGroup.delete(pid);
  if (g.members.length <= 1) {
    dissolveGroup(gid, ctx);
    return true;
  }
  if (String(g.leader) === String(pid)) g.leader = g.members[0];
  pushGroup(gid, ctx);
  return true;
}

// Plus d'escadrille : clôture, le dernier repart en solo aussi.
function dissolveGroup(gid, ctx) {
  try {
    const g = groups.get(gid);
    if (!g) return;
    for (const m of g.members) {
      memberGroup.delete(String(m));
      try { ctx.sendTo(String(m), { t: "groupUpdate", group: null }); } catch {}
    }
    groups.delete(gid);
  } catch {}
}

// Escadrille solo restante (ex : invitation refusée) : clôture silencieuse.
function dissolveIfSolo(pid, ctx) {
  try {
    const gid = memberGroup.get(String(pid));
    const g = gid ? groups.get(gid) : null;
    if (!g || g.members.length > 1) return;
    dissolveGroup(gid, ctx);
  } catch {}
}

function pruneInvites(now) {
  for (const [pid, inv] of invites) {
    if (now - Number(inv?.at || 0) > INVITE_TTL_MS) invites.delete(pid);
  }
}

export function socialGroupOf(pid) {
  return memberGroup.get(String(pid)) || null;
}

export function socialDescribeGroup(pid, ctx) {
  const gid = memberGroup.get(String(pid));
  if (!gid) return null;
  return publicGroup(gid, ctx);
}

// Changement de map / pseudo : rafraîchit la fiche groupe des coéquipiers.
export function socialPeerChanged(pid, ctx) {
  try {
    const gid = memberGroup.get(String(pid));
    if (gid && groups.has(gid)) pushGroup(gid, ctx);
  } catch {}
}

// Déconnexion : quitte le groupe + purge les invites le concernant.
export function socialPeerGone(pid, ctx) {
  try {
    pruneInvites(Date.now());
    for (const [target, inv] of invites) {
      if (String(target) === String(pid) || String(inv?.from) === String(pid)) invites.delete(target);
    }
    leaveGroup(String(pid), ctx);
  } catch {}
}

export function handleSocialMessage(ctx, msg) {
  const t = msg?.t;
  if (t !== "groupCreate" && t !== "groupInvite" && t !== "groupAccept" && t !== "groupDecline"
    && t !== "groupLeave" && t !== "groupKick" && t !== "groupChat" && t !== "groupSync" && t !== "whisper") {
    return false;
  }
  const me = String(ctx.id);
  try {
    if (t === "groupSync") {
      ctx.send({ t: "groupUpdate", group: socialDescribeGroup(me, ctx) });
      const inv = invites.get(me);
      if (inv && Date.now() - Number(inv.at || 0) <= INVITE_TTL_MS) {
        ctx.send({ t: "groupInvite", from: String(inv.from), fromPseudo: cleanPseudo(inv.fromPseudo), groupId: String(inv.gid) });
      }
      return true;
    }
    if (t === "groupCreate") {
      // Bouton Créer retiré (création auto à l'invitation) : conservé
      // pour compatibilité protocole, silencieux.
      if (memberGroup.has(me)) { ctx.send({ t: "groupNotice", text: "Tu es déjà dans un groupe." }); return true; }
      const gid = `g${nextGroup++}`;
      groups.set(gid, { id: gid, leader: me, members: [me], created: Date.now() });
      memberGroup.set(me, gid);
      pushGroup(gid, ctx);
      return true;
    }
    if (t === "groupInvite") {
      pruneInvites(Date.now());
      const target = ctx.findByPseudo(msg.to);
      if (!target) { ctx.send({ t: "groupNotice", text: "Pilote introuvable ou hors ligne." }); return true; }
      if (String(target.id) === me) { ctx.send({ t: "groupNotice", text: "Tu ne peux pas t'inviter toi-même." }); return true; }
      let gid = memberGroup.get(me);
      if (!gid) {
        gid = `g${nextGroup++}`;
        groups.set(gid, { id: gid, leader: me, members: [me], created: Date.now() });
        memberGroup.set(me, gid);
        pushGroup(gid, ctx);
      }
      const g = groups.get(gid);
      if (String(g.leader) !== me) { ctx.send({ t: "groupNotice", text: "Seul le chef peut inviter." }); return true; }
      if (g.members.length >= GROUP_MAX) { ctx.send({ t: "groupNotice", text: `Groupe plein (${GROUP_MAX} max).` }); return true; }
      if (memberGroup.get(String(target.id))) { ctx.send({ t: "groupNotice", text: `${target.pseudo} est déjà dans un groupe.` }); return true; }
      invites.set(String(target.id), { gid, from: me, fromPseudo: cleanPseudo(ctx.state?.pseudo), at: Date.now() });
      ctx.sendTo(String(target.id), { t: "groupInvite", from: me, fromPseudo: cleanPseudo(ctx.state?.pseudo), groupId: gid });
      pushGroup(gid, ctx);
      return true;
    }
    if (t === "groupAccept") {
      pruneInvites(Date.now());
      const inv = invites.get(me);
      if (!inv) { ctx.send({ t: "groupNotice", text: "Aucune invitation en attente." }); return true; }
      invites.delete(me);
      const g = groups.get(String(inv.gid));
      if (!g) { ctx.send({ t: "groupNotice", text: "Ce groupe n'existe plus." }); return true; }
      if (g.members.length >= GROUP_MAX) { ctx.send({ t: "groupNotice", text: "Groupe plein." }); return true; }
      leaveGroup(me, ctx);
      g.members.push(me);
      memberGroup.set(me, gidOf(g));
      pushGroup(gidOf(g), ctx);
      return true;
    }
    if (t === "groupDecline") {
      const inv = invites.get(me);
      invites.delete(me);
      if (inv) {
        try { ctx.sendTo(String(inv.from), { t: "groupNotice", text: `${cleanPseudo(ctx.state?.pseudo) || "Un pilote"} a refusé ton invitation.` }); } catch {}
        dissolveIfSolo(String(inv.from), ctx);
      }
      ctx.send({ t: "groupUpdate", group: socialDescribeGroup(me, ctx) });
      return true;
    }
    if (t === "groupLeave") {
      if (!leaveGroup(me, ctx)) ctx.send({ t: "groupUpdate", group: null });
      else ctx.send({ t: "groupUpdate", group: null });
      return true;
    }
    if (t === "groupKick") {
      const gid = memberGroup.get(me);
      const g = gid ? groups.get(gid) : null;
      if (!g || String(g.leader) !== me) { ctx.send({ t: "groupNotice", text: "Seul le chef peut exclure." }); return true; }
      const target = String(msg.target || "");
      if (!target || String(g.leader) === target) return true;
      if (!g.members.some((m) => String(m) === target)) { ctx.send({ t: "groupNotice", text: "Pas dans ton groupe." }); return true; }
      g.members = g.members.filter((m) => String(m) !== target);
      memberGroup.delete(target);
      try { ctx.sendTo(target, { t: "groupUpdate", group: null }); } catch {}
      try { ctx.sendTo(target, { t: "groupNotice", text: "Tu as été exclu du groupe." }); } catch {}
      if (g.members.length <= 1) dissolveGroup(gid, ctx);
      else pushGroup(gid, ctx);
      return true;
    }
    if (t === "groupChat") {
      const gid = memberGroup.get(me);
      if (!gid || !groups.has(gid)) { ctx.send({ t: "groupNotice", text: "Rejoins un groupe pour discuter." }); return true; }
      const now = Date.now();
      if (now - Number(groupChatLast.get(me) || 0) < GROUP_CHAT_MIN_MS) return true;
      const text = String(msg.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (!text) return true;
      groupChatLast.set(me, now);
      const g = groups.get(gid);
      const entry = { t: "groupMsg", from: me, fromPseudo: cleanPseudo(ctx.state?.pseudo), text, at: now };
      for (const m of g.members) {
        try { ctx.sendTo(m, entry); } catch {}
      }
      return true;
    }
    if (t === "whisper") {
      const now = Date.now();
      if (now - Number(whisperLast.get(me) || 0) < WHISPER_MIN_MS) return true;
      const target = ctx.findByPseudo(msg.to);
      if (!target) { ctx.send({ t: "whisperNotice", text: "Pilote introuvable ou hors ligne." }); return true; }
      const text = String(msg.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (!text) return true;
      whisperLast.set(me, now);
      const entry = { t: "whisperMsg", from: me, fromPseudo: cleanPseudo(ctx.state?.pseudo), text, at: now };
      try { ctx.sendTo(String(target.id), entry); } catch {}
      // Accusé de réception (le client affiche son propre message).
      ctx.send({ t: "whisperSent", to: String(target.id), toPseudo: target.pseudo, text, at: now });
      return true;
    }
  } catch {}
  return true;
}

function gidOf(g) {
  return String(g?.id || "");
}
