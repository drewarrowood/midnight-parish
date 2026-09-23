import { create } from "zustand";

export type Phase = "menu" | "play" | "pause" | "dead";

export type HudState = {
  phase: Phase;
  health: number;
  blood: number;
  cash: number;
  heat: number;
  clock: string;
  objective: string;
  missionTitle: string;
  prompt: string;
  banner: string;
  scanner: string;
  radio: string;
  inCar: boolean;
  speedMph: number;
  lowBlood: boolean;
  sun: number;
  vignette: number;
  district: string;
  night: number;
  fed: number;
  bestCash: number;
  deathReason: string;
  muted: boolean;
  mapOpen: boolean;
  missionsCleared: number;
  arrow: number | null;
  popup: string;
  setPhase: (phase: Phase) => void;
  toggleMute: () => void;
  toggleMap: () => void;
  patch: (partial: Partial<HudState>) => void;
};

export const useGame = create<HudState>((set) => ({
  phase: "menu",
  health: 100,
  blood: 36,
  cash: 0,
  heat: 0,
  clock: "11:41 PM",
  objective: "Bite the marked tourist on Bourbon",
  missionTitle: "First Blood",
  prompt: "",
  banner: "",
  scanner: "",
  radio: "",
  inCar: false,
  speedMph: 0,
  lowBlood: false,
  sun: 0,
  vignette: 0,
  district: "Bourbon Street",
  night: 1,
  fed: 0,
  bestCash: 0,
  deathReason: "",
  muted: false,
  mapOpen: false,
  missionsCleared: 0,
  arrow: null,
  popup: "",
  setPhase: (phase) => set({ phase }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  toggleMap: () => set((s) => ({ mapOpen: !s.mapOpen })),
  patch: (partial) => set(partial),
}));
