import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function AuthCallback() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const hash = window.location.hash;
    const sid = new URLSearchParams(hash.replace("#", "")).get("session_id");
    if (!sid) { nav("/login"); return; }
    (async () => {
      try {
        const { data } = await api.post("/auth/google/session", { session_id: sid });
        setUser(data);
        window.history.replaceState(null, "", "/account");
        nav("/account", { state: { user: data } });
      } catch {
        nav("/login");
      }
    })();
  }, []); // eslint-disable-line

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-[var(--blush-line)] border-t-[var(--brand)] rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-[var(--ink-soft)]">Signing you in...</p>
      </div>
    </div>
  );
}
