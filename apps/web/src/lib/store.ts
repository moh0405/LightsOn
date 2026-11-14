import { useEffect } from "react";
import { create } from "zustand";
import { fetchHealth } from "./api";

export interface HealthState {
  status: "loading" | "ok" | "down";
  dataMode: string | null;
  load: () => Promise<void>;
}

export const useHealthStore = create<HealthState>((set) => ({
  status: "loading",
  dataMode: null,
  load: async () => {
    try {
      const h = await fetchHealth();
      set({ status: h.ok ? "ok" : "down", dataMode: h.data_mode });
    } catch {
      set({ status: "down", dataMode: null });
    }
  },
}));

export function useHealth(): HealthState {
  const state = useHealthStore();
  useEffect(() => {
    void state.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}
