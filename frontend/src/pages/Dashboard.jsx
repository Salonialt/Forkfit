import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import Layout from "@/components/Layout";
import MacroRing from "@/components/MacroRing";
import { Sparkles, Droplet, Plus, Camera, Utensils, MessageSquare, Trash2, Flame, Leaf, Brain, ChevronRight, Scale, TrendingDown, TrendingUp, Check } from "lucide-react";

function WeightPrompt({ profile, onLogged }) {
  const [status, setStatus] = useState({ logged: false, entry: null });
  const [history, setHistory] = useState([]);
  const [weight, setWeight] = useState(profile?.weight_kg || "");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [t, h] = await Promise.all([api.get("/weight/today"), api.get("/weight/history")]);
    setStatus(t.data);
    setHistory(h.data.entries || []);
    if (t.data?.entry?.weight_kg) setWeight(t.data.entry.weight_kg);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!weight || weight <= 0) return;
    setBusy(true);
    try {
      await api.post("/weight/log", { weight_kg: parseFloat(weight) });
      await load();
      onLogged?.();
    } finally { setBusy(false); }
  };

  const prev = history.length >= 2 ? history[history.length - 2] : null;
  const curr = history[history.length - 1];
  const delta = curr && prev ? +(curr.weight_kg - prev.weight_kg).toFixed(1) : 0;
  const goingDown = delta < 0;
  const targetDelta = profile ? +(profile.weight_kg - profile.target_weight_kg).toFixed(1) : 0;
  const goalIsLoss = profile?.goal?.includes("loss") || profile?.goal === "fat_loss";
  const trendGood = (goalIsLoss && goingDown) || (!goalIsLoss && !goingDown && delta !== 0);

  return (
    <div className="clay-card p-6 fade-up delay-1" data-testid="weight-card"
      style={status.logged ? {} : { border: "1px solid var(--terracotta)", background: "linear-gradient(180deg, #FFF6F2 0%, #fff 100%)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Scale size={18} style={{ color: status.logged ? "var(--primary)" : "var(--terracotta)" }} />
          <span className="eyebrow" style={{ color: status.logged ? "var(--primary)" : "var(--terracotta)" }}>
            {status.logged ? "Weight logged today" : "Log today's weight"}
          </span>
        </div>
        {status.logged && <Check size={16} style={{ color: "var(--primary)" }} />}
      </div>

      {!status.logged && (
        <p className="text-xs mt-2" style={{ color: "var(--text-2)" }}>
          Daily weigh-ins make your calorie & macro targets dynamically adjust as you progress.
        </p>
      )}

      <div className="flex items-center gap-2 mt-4">
        <input data-testid="weight-input" type="number" step="0.1" min="20" max="300" value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="input-clay flex-1" placeholder="e.g. 64.5" />
        <span className="text-sm font-semibold" style={{ color: "var(--text-2)" }}>kg</span>
        <button onClick={submit} disabled={busy || !weight} data-testid="weight-submit"
          className="pill-btn pill-btn-primary text-sm">
          {busy ? "…" : status.logged ? "Update" : "Log"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg p-2" style={{ background: "#F4F2EE" }}>
          <div className="text-[10px] eyebrow" style={{ color: "var(--text-2)" }}>Current</div>
          <div className="font-display font-bold text-lg" style={{ color: "var(--text)" }}>
            {profile?.weight_kg?.toFixed(1) || "—"}
          </div>
        </div>
        <div className="rounded-lg p-2" style={{ background: "#F4F2EE" }}>
          <div className="text-[10px] eyebrow" style={{ color: "var(--text-2)" }}>Δ vs yesterday</div>
          <div className="font-display font-bold text-lg flex items-center justify-center gap-1"
            style={{ color: delta === 0 ? "var(--text-2)" : trendGood ? "var(--primary)" : "var(--terracotta)" }}>
            {delta !== 0 && (goingDown ? <TrendingDown size={14} /> : <TrendingUp size={14} />)}
            {delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${delta}`}
          </div>
        </div>
        <div className="rounded-lg p-2" style={{ background: "#F4F2EE" }}>
          <div className="text-[10px] eyebrow" style={{ color: "var(--text-2)" }}>To goal</div>
          <div className="font-display font-bold text-lg" style={{ color: "var(--ochre)" }}>
            {targetDelta > 0 ? `-${targetDelta}` : targetDelta < 0 ? `+${Math.abs(targetDelta)}` : "✓"}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [profile, setProfile] = useState(null);
  const [today, setToday] = useState({ logs: [], totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }, water_ml: 0 });
  const [recs, setRecs] = useState([]);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, t, r, pl] = await Promise.all([
      api.get("/profile"), api.get("/log/today"), api.get("/recommendations"), api.get("/meal-plan/latest"),
    ]);
    setProfile(p.data); setToday(t.data); setRecs(r.data.items || []); setPlan(pl.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const addWater = async (ml) => { await api.post("/log/water", { amount_ml: ml }); load(); };
  const delLog = async (id) => { await api.delete(`/log/food/${id}`); load(); };

  const generatePlan = async () => {
    setBusy(true);
    try { const { data } = await api.post("/meal-plan/generate"); setPlan(data); } finally { setBusy(false); }
  };

  if (!profile) return <Layout><div className="text-center py-20" style={{ color: "var(--text-2)" }}>Loading…</div></Layout>;

  const t = profile.targets;

  return (
    <Layout>
      <div className="mb-8 fade-up">
        <span className="eyebrow">Today · {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</span>
        <h1 className="font-display font-bold text-4xl sm:text-5xl tracking-tight mt-2" style={{ color: "var(--text)" }}>
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}.
        </h1>
        <p className="mt-2 text-base" style={{ color: "var(--text-2)" }}>
          BMR <strong>{profile.bmr}</strong> kcal · TDEE <strong>{profile.tdee}</strong> kcal · target <strong>{t.calories}</strong> kcal.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily weight prompt — full width so it's the first thing users see */}
        <div className="lg:col-span-3">
          <WeightPrompt profile={profile} onLogged={load} />
        </div>

        {/* Main rings card */}
        <div className="clay-card p-8 lg:col-span-2 fade-up delay-1" data-testid="macros-card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="eyebrow">Daily Macros</span>
              <h3 className="font-display font-semibold text-2xl mt-1" style={{ color: "var(--text)" }}>Today's nutrition</h3>
            </div>
            <Flame size={22} style={{ color: "var(--terracotta)" }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MacroRing testId="ring-calories" label="kcal" value={today.totals.calories} target={t.calories} unit="" color="#4A6B53" />
            <MacroRing testId="ring-protein" label="Protein" value={today.totals.protein_g} target={t.protein_g} unit="g" color="#D96C51" />
            <MacroRing testId="ring-carbs" label="Carbs" value={today.totals.carbs_g} target={t.carbs_g} unit="g" color="#D9A05B" />
            <MacroRing testId="ring-fat" label="Fat" value={today.totals.fat_g} target={t.fat_g} unit="g" color="#7A9E9F" />
          </div>
        </div>

        {/* Water card */}
        <div className="clay-card p-6 fade-up delay-2" data-testid="water-card">
          <span className="eyebrow" style={{ color: "var(--water)" }}>Hydration</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="font-display font-bold text-4xl" style={{ color: "var(--text)" }}>{(today.water_ml / 1000).toFixed(1)}</span>
            <span className="text-sm" style={{ color: "var(--text-2)" }}>/ {(t.water_ml / 1000).toFixed(1)} L</span>
          </div>
          <div className="h-2 bg-[#EFEDE9] rounded-full mt-3 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (today.water_ml / t.water_ml) * 100)}%`, background: "var(--water)" }} />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-5">
            {[250, 500, 750].map((ml) => (
              <button key={ml} data-testid={`water-${ml}`} className="pill-btn pill-btn-ghost text-xs flex items-center justify-center gap-1" onClick={() => addWater(ml)}>
                <Droplet size={12} /> +{ml}ml
              </button>
            ))}
          </div>
        </div>

        {/* Recommendations */}
        <div className="clay-card p-6 lg:col-span-2 fade-up delay-3" data-testid="recs-card">
          <div className="flex items-center gap-2 mb-3">
            <Brain size={18} style={{ color: "var(--primary)" }} />
            <span className="eyebrow">AI Recommendations</span>
          </div>
          <ul className="space-y-2">
            {recs.map((r, i) => (
              <li key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "#F4F2EE" }}>
                <Sparkles size={16} className="mt-0.5 flex-shrink-0" style={{ color: "var(--primary)" }} />
                <span className="text-sm" style={{ color: "var(--text)" }}>{r.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Quick actions */}
        <div className="clay-card p-6 fade-up delay-4">
          <span className="eyebrow">Quick Actions</span>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Link to="/scan" data-testid="qa-scan" className="p-4 rounded-xl border border-[#E8E3DF] bg-white hover:bg-[#F4F2EE] transition flex flex-col gap-2">
              <Camera size={20} style={{ color: "var(--primary)" }} />
              <span className="text-sm font-semibold">Scan Food</span>
            </Link>
            <Link to="/chat" data-testid="qa-chat" className="p-4 rounded-xl border border-[#E8E3DF] bg-white hover:bg-[#F4F2EE] transition flex flex-col gap-2">
              <MessageSquare size={20} style={{ color: "var(--terracotta)" }} />
              <span className="text-sm font-semibold">Ask Coach</span>
            </Link>
            <Link to="/meal-plan" data-testid="qa-plan" className="p-4 rounded-xl border border-[#E8E3DF] bg-white hover:bg-[#F4F2EE] transition flex flex-col gap-2">
              <Utensils size={20} style={{ color: "var(--ochre)" }} />
              <span className="text-sm font-semibold">Meal Plan</span>
            </Link>
            <Link to="/grocery" data-testid="qa-grocery" className="p-4 rounded-xl border border-[#E8E3DF] bg-white hover:bg-[#F4F2EE] transition flex flex-col gap-2">
              <Leaf size={20} style={{ color: "var(--water)" }} />
              <span className="text-sm font-semibold">Grocery</span>
            </Link>
          </div>
        </div>

        {/* Today's log */}
        <div className="clay-card p-6 lg:col-span-2 fade-up" data-testid="logs-card">
          <div className="flex items-center justify-between mb-4">
            <span className="eyebrow">Food Diary</span>
            <Link to="/scan" className="text-sm flex items-center gap-1" style={{ color: "var(--primary)" }} data-testid="add-food-link">
              <Plus size={14} /> Add
            </Link>
          </div>
          {today.logs.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: "var(--text-2)" }}>No meals logged yet. Snap a photo or chat with your coach.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {today.logs.map((l) => (
                <li key={l.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm" style={{ color: "var(--text)" }}>{l.food_name}</div>
                    <div className="text-xs" style={{ color: "var(--text-2)" }}>{l.meal_type} · P {l.protein_g}g · C {l.carbs_g}g · F {l.fat_g}g</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-display font-bold text-sm" style={{ color: "var(--terracotta)" }}>{Math.round(l.calories)} kcal</span>
                    <button data-testid={`del-${l.id}`} onClick={() => delLog(l.id)} className="text-[#5E7363] hover:text-[#D96C51]"><Trash2 size={14} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Meal plan preview */}
        <div className="clay-card p-6 fade-up" data-testid="plan-card">
          <span className="eyebrow">Today's plan</span>
          {!plan ? (
            <div className="mt-4">
              <p className="text-sm mb-4" style={{ color: "var(--text-2)" }}>Generate your AI meal plan tailored to your goal and preferences.</p>
              <button data-testid="generate-plan-btn" disabled={busy} onClick={generatePlan} className="pill-btn pill-btn-primary text-sm w-full">
                {busy ? "Generating…" : "Generate Plan"}
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {(plan.plan.meals || []).slice(0, 4).map((m, i) => (
                <div key={i} className="flex justify-between items-start text-sm">
                  <div>
                    <div className="font-semibold" style={{ color: "var(--text)" }}>{m.meal}</div>
                    <div className="text-xs" style={{ color: "var(--text-2)" }}>{m.food}</div>
                  </div>
                  <div className="text-xs" style={{ color: "var(--terracotta)" }}>{m.calories}</div>
                </div>
              ))}
              <Link to="/meal-plan" className="text-sm flex items-center gap-1 mt-2" style={{ color: "var(--primary)" }} data-testid="view-plan-link">
                View full plan <ChevronRight size={14} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
