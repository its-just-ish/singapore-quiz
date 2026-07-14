// Guest identity for v1 — a persistent player id in localStorage, no auth.
export function getPlayerId(): string {
  let id = localStorage.getItem("kaki_player_id");
  if (!id) {
    id = `plyr_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    localStorage.setItem("kaki_player_id", id);
  }
  return id;
}

export function getNickname(): string {
  return localStorage.getItem("kaki_nickname") ?? "";
}

export function setNickname(nickname: string) {
  localStorage.setItem("kaki_nickname", nickname);
}

export function rememberHostKey(code: string, hostPlayerId: string) {
  localStorage.setItem(`kaki_host_${code}`, hostPlayerId);
}

export function getHostKey(code: string): string | null {
  return localStorage.getItem(`kaki_host_${code}`);
}
