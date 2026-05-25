import { useEffect } from "react";
import { useMapStore } from "./useMapStore";

const STORAGE_TARGET = "rocom-map:hotkey-target";
const STORAGE_UNDO = "rocom-map:hotkey-undo";

export function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F9") {
        const raw = localStorage.getItem(STORAGE_TARGET);
        if (!raw) return;
        const id = Number(raw);
        useMapStore.getState().toggleCompleted(id);
        localStorage.setItem(STORAGE_UNDO, raw);
        localStorage.removeItem(STORAGE_TARGET);
      }
      if (e.key === "F10") {
        const raw = localStorage.getItem(STORAGE_UNDO);
        if (!raw) return;
        const id = Number(raw);
        useMapStore.getState().toggleCompleted(id);
        localStorage.setItem(STORAGE_TARGET, raw);
        localStorage.removeItem(STORAGE_UNDO);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { markKey: "F9", undoKey: "F10" };
}

export function setHotkeyTarget(id: number) {
  localStorage.setItem(STORAGE_TARGET, String(id));
}
