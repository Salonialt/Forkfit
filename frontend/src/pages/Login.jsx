import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Leaf, ArrowRight } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await login(email, password);
    setBusy(false);
    if (r.ok) nav(loc.state?.from || "/dashboard");
    else setError(r.error);
  };

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)" }}>
      <div className="hidden md:flex md:w-1/2 dotted-bg items-center justify-center p-12">
        <div className="max-w-md fade-up">
          <span className="eyebrow">Personalized · Evidence-based</span>
          <h1 className="font-display font-bold tracking-tight mt-3 text-5xl lg:text-6xl" style={{ color: "var(--text)" }}>
            Eat with <span style={{ color: "var(--primary)" }}>intent</span>.
          </h1>
          <p className="mt-6 text-base leading-relaxed" style={{ color: "var(--text-2)" }}>
            Your AI nutrition coach designs meal plans that fit your body, goals, and culture — and adapts as you progress.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-center">
            {[
              { n: "1.4M+", l: "Foods" }, { n: "12 +", l: "Goals" }, { n: "AI", l: "Vision" },
            ].map((it) => (
              <div key={it.l} className="clay-card p-4">
                <div className="font-display font-bold text-xl" style={{ color: "var(--primary)" }}>{it.n}</div>
                <div className="text-xs" style={{ color: "var(--text-2)" }}>{it.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm fade-up" data-testid="login-form">
          <Link to="/" className="inline-flex items-center gap-2 font-display font-bold text-xl mb-8">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--primary)" }}>
              <Leaf size={18} color="white" />
            </span>
            forkfit
          </Link>
          <h2 className="font-display font-semibold text-3xl mb-2" style={{ color: "var(--text)" }}>Welcome back</h2>
          <p className="text-sm mb-8" style={{ color: "var(--text-2)" }}>Sign in to continue your journey.</p>

          <label className="eyebrow block mb-2">Email</label>
          <input data-testid="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input-clay mb-4" placeholder="you@example.com" />

          <label className="eyebrow block mb-2">Password</label>
          <input data-testid="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input-clay mb-4" placeholder="••••••••" />

          {error && <div className="text-sm mb-4 px-3 py-2 rounded-lg" style={{ background: "#FCE6DF", color: "#A4341B" }} data-testid="login-error">{error}</div>}

          <button type="submit" disabled={busy} data-testid="login-submit" className="pill-btn pill-btn-primary w-full flex items-center justify-center gap-2">
            {busy ? "Signing in…" : <>Sign in <ArrowRight size={16} /></>}
          </button>
          <p className="text-sm mt-6 text-center" style={{ color: "var(--text-2)" }}>
            New here? <Link to="/register" className="font-semibold" style={{ color: "var(--primary)" }} data-testid="link-register">Create an account</Link>
          </p>
          <p className="text-xs mt-3 text-center" style={{ color: "var(--text-2)" }}>
            Demo: admin@dietai.com / admin123
          </p>
        </form>
      </div>
    </div>
  );
}