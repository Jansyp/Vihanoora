import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const SettingsCtx = createContext(null);
export const useSettings = () => useContext(SettingsCtx);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [reduceMotion, setReduceMotion] = useState(
    () => localStorage.getItem("jh_reduce_motion") === "1"
  );

  useEffect(() => {
    api.get("/settings").then(({ data }) => setSettings(data)).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
    localStorage.setItem("jh_reduce_motion", reduceMotion ? "1" : "0");
  }, [reduceMotion]);

  return (
    <SettingsCtx.Provider value={{ settings, reduceMotion, setReduceMotion }}>
      {children}
    </SettingsCtx.Provider>
  );
}
