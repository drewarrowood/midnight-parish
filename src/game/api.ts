import { unlockAudio } from "./audio";

type Api = {
  begin: () => void;
  resume: () => void;
  respawn: () => void;
  abandon: () => void;
  toggleMute: () => void;
};

let api: Api | null = null;
let pendingBegin = false;

export function bindGame(next: Api) {
  api = next;
  if (pendingBegin) {
    pendingBegin = false;
    next.begin();
  }
}

export function unbindGame(next: Api) {
  if (api === next) api = null;
}

export function requestBegin() {
  unlockAudio();
  if (api) api.begin();
  else pendingBegin = true;
}

export function requestResume() {
  unlockAudio();
  api?.resume();
}

export function requestRespawn() {
  unlockAudio();
  api?.respawn();
}

export function requestAbandon() {
  api?.abandon();
}

export function requestMute() {
  api?.toggleMute();
}
