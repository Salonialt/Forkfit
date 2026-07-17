import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Layout from "@/components/Layout";
import { Utensils, Sparkles, Clock, Lightbulb } from "lucide-react";

export default function MealPlan() {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => { const { data } = await api.get("/meal-plan/latest"); setPlan(data); };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true); setErr("");
    try { const { data } = await api.post("/meal-plan/generate"); setPlan(data); }
    catch (e) { setErr(e.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };

  const logMeal = async (m) => {
    await api.post("/log/food", {
      food_name: m.food, calories: m.calories, protein_g: m.protein_g,
      carbs_g: m.carbs_g, fat_g: m.fat_g, meal_type: (m.meal || "snack").toLowerCase(),
    });
    alert("Logged to your diary");
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6 fade-up">
        <div>
          <span className="eyebrow">Personalized · AI generated</span>
          <h1 className="font-display font-bold text-4xl sm:text-5xl mt-1" style={{ color: "var(--text)" }}>Your meal plan</h1>
        </div>
        <button data-testid="regen-plan-btn" disabled={busy} onClick={generate} className="pill-btn pill-btn-primary flex items-center gap-2">
          <Sparkles size={16} /> {plan ? "Regenerate" : busy ? "Generating…" : "Generate"}
        </button>
      </div>

      {err && <div className="text-sm mb-4 px-3 py-2 rounded-lg" style={{ background: "#FCE6DF", color: "#A4341B" }}>{err}</div>}

      {!plan && !busy && (
        <div className="clay-card p-12 text-center fade-up" data-testid="plan-empty">
          <Utensils size={36} className="mx-auto mb-3" style={{ color: "var(--primary)" }} />
          <h3 className="font-display font-semibold text-xl">No plan yet</h3>
          <p className="text-sm mt-2" style={{ color: "var(--text-2)" }}>Generate a 1-day plan tailored to your goal, region & dietary preference.</p>
        </div>
      )}

      {busy && (
        <div className="clay-card p-12 text-center">
          <div className="animate-pulse text-sm" style={{ color: "var(--text-2)" }}>Crafting your plan with Claude…</div>
        </div>
      )}

      {plan?.plan && (
        <div className="space-y-4 fade-up">
          {plan.plan.daily_totals && (
            <div className="clay-card p-6 grid grid-cols-4 gap-4 text-center">
              {[
                { l: "kcal", v: plan.plan.daily_totals.calories, c: "var(--primary)" },
                { l: "Protein", v: plan.plan.daily_totals.protein_g + "g", c: "var(--terracotta)" },
                { l: "Carbs", v: plan.plan.daily_totals.carbs_g + "g", c: "var(--ochre)" },
                { l: "Fat", v: plan.plan.daily_totals.fat_g + "g", c: "var(--water)" },
              ].map((t) => (
                <div key={t.l}>
                  <div className="font-display font-bold text-2xl" style={{ color: t.c }}>{t.v}</div>
                  <div className="text-xs" style={{ color: "var(--text-2)" }}>{t.l}</div>
                </div>
              ))}
            </div>
          )}
          {plan.plan.meals?.map((m, i) => (
            <div key={i} className="clay-card p-6" data-testid={`meal-${i}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="eyebrow">{m.meal}</span>
                    {m.time && <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-2)" }}><Clock size={11} /> {m.time}</span>}
                  </div>
                  <h3 className="font-display font-semibold text-xl mt-1" style={{ color: "var(--text)" }}>{m.food}</h3>
                  {m.ingredients && <p className="text-xs mt-1" style={{ color: "var(--text-2)" }}>{m.ingredients.join(" · ")}</p>}
                  {m.why && (
                    <p className="text-xs mt-3 flex items-start gap-1.5 p-2 rounded-lg" style={{ background: "#F4F2EE", color: "var(--text-2)" }}>
                      <Lightbulb size={12} className="mt-0.5 flex-shrink-0" /> {m.why}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-display font-bold text-xl" style={{ color: "var(--terracotta)" }}>{m.calories}</div>
                  <div className="text-xs" style={{ color: "var(--text-2)" }}>P {m.protein_g}g · C {m.carbs_g}g · F {m.fat_g}g</div>
                  <button data-testid={`log-meal-${i}`} onClick={() => logMeal(m)} className="pill-btn pill-btn-ghost text-xs mt-3">Log to diary</button>
                </div>
              </div>
            </div>
          ))}
          {plan.plan.tips?.length > 0 && (
            <div className="clay-card p-6">
              <span className="eyebrow">Coach tips</span>
              <ul className="mt-3 space-y-2">
                {plan.plan.tips.map((t, i) => (
                  <li key={i} className="text-sm flex items-start gap-2" style={{ color: "var(--text)" }}>
                    <Sparkles size={14} className="mt-0.5" style={{ color: "var(--primary)" }} /> {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}