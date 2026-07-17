import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Leaf, ArrowRight } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await register(email, password, name);
    setBusy(false);
    if (r.ok) nav("/onboarding");
    else setError(r.error);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 dotted-bg">
      <form onSubmit={submit} className="w-full max-w-md clay-card p-8 fade-up" data-testid="register-form">
        <Link to="/" className="inline-flex items-center gap-2 font-display font-bold text-xl mb-6">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--primary)" }}>
            <Leaf size={18} color="white" />
          </span>
          forkfit
        </Link>
        <h2 className="font-display font-semibold text-3xl mb-2" style={{ color: "var(--text)" }}>Create your plan</h2>
        <p className="text-sm mb-6" style={{ color: "var(--text-2)" }}>It takes less than a minute.</p>

        <label className="eyebrow block mb-2">Name</label>
        <input data-testid="reg-name" required value={name} onChange={(e) => setName(e.target.value)} className="input-clay mb-4" placeholder="Aiyana Reyes" />

        <label className="eyebrow block mb-2">Email</label>
        <input data-testid="reg-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input-clay mb-4" placeholder="you@example.com" />

        <label className="eyebrow block mb-2">Password</label>
        <input data-testid="reg-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="input-clay mb-4" placeholder="At least 6 characters" />

        {error && <div className="text-sm mb-4 px-3 py-2 rounded-lg" style={{ background: "#FCE6DF", color: "#A4341B" }} data-testid="reg-error">{error}</div>}

        <button type="submit" disabled={busy} data-testid="reg-submit" className="pill-btn pill-btn-primary w-full flex items-center justify-center gap-2">
          {busy ? "Creating…" : <>Create account <ArrowRight size={16} /></>}
        </button>
        <p className="text-sm mt-6 text-center" style={{ color: "var(--text-2)" }}>
          Already have an account? <Link to="/login" className="font-semibold" style={{ color: "var(--primary)" }} data-testid="link-login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}