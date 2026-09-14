import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Section } from "@/components/common";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function Login() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      toast.success("Welcome to JAVE HOUSE!");
      nav("/account");
    } catch (e2) { setErr(formatApiError(e2.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/account";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <Section className="max-w-md">
      <div className="bg-white rounded-[2rem] border border-[var(--line)] p-8 soft-shadow">
        <h1 className="font-serif text-3xl font-semibold text-center">{mode === "login" ? "Welcome back" : "Create account"}</h1>
        <p className="text-center text-[var(--ink-soft)] text-sm mt-1">{mode === "login" ? "Login to track orders & save favourites" : "Join the JAVE fam"}</p>

        <button data-testid="google-login-btn" onClick={googleLogin} className="w-full mt-6 flex items-center justify-center gap-3 py-3.5 rounded-full border border-[var(--line)] font-medium hover:bg-[var(--card-2)] transition-colors">
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="" className="w-5 h-5" /> Continue with Google
        </button>

        <div className="flex items-center gap-3 my-5">
          <span className="flex-1 h-px bg-[var(--line)]" /><span className="text-xs text-[var(--ink-soft)]">or</span><span className="flex-1 h-px bg-[var(--line)]" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "register" && (
            <input data-testid="auth-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" required className="w-full px-4 py-3 rounded-xl bg-[var(--card-2)] outline-none text-sm" />
          )}
          <input data-testid="auth-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" required className="w-full px-4 py-3 rounded-xl bg-[var(--card-2)] outline-none text-sm" />
          <input data-testid="auth-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password" required className="w-full px-4 py-3 rounded-xl bg-[var(--card-2)] outline-none text-sm" />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <button data-testid="auth-submit" disabled={busy} className="w-full py-3.5 rounded-full bg-[var(--brand)] text-white font-medium disabled:opacity-50">{busy ? "Please wait..." : mode === "login" ? "Login" : "Create Account"}</button>
        </form>

        <p className="text-center text-sm text-[var(--ink-soft)] mt-5">
          {mode === "login" ? "New here? " : "Already have an account? "}
          <button data-testid="auth-toggle" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }} className="text-[var(--brand)] font-semibold">
            {mode === "login" ? "Create an account" : "Login"}
          </button>
        </p>
        <p className="text-center text-xs text-[var(--ink-soft)] mt-3">Prefer not to sign in? <Link to="/cart" className="underline">Guest checkout</Link> is always available.</p>
      </div>
    </Section>
  );
}
