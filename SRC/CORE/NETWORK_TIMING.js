// Avance maximale sur le dernier tick serveur, commune a la simulation et
// a la validation du mouvement. Cette dette fixe est remboursee par les ticks
// suivants : les frames, messages et reconnexions ne la renouvellent pas.
export const NETWORK_TIMING_GRACE_SEC = 0.25;
