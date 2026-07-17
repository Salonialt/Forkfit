import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, formatErr } from "@/lib/api";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";

const GOALS = [
  { id: "weight_loss", label: "Weight Loss" },
  { id: "weight_gain", label: "Weight Gain" },
  { id: "muscle_gain", label: "Muscle Gain" },
  { id: "fat_loss", label: "Fat Loss" },
  { id: "body_recomp", label: "Body Recomposition" },
  { id: "diabetes", label: "Diabetes Management" },
  { id: "heart_healthy", label: "Heart-Healthy" },
  { id: "pcos", label: "PCOS Diet" },
  { id: "pregnancy", label: "Pregnancy Nutrition" },
  { id: "sports", label: "Sports Nutrition" },
  { id: "general", label: "General Healthy" },
];
const DIETS = ["vegetarian", "vegan", "eggetarian", "non-vegetarian"];
const ACTIVITY = [
  { id: "sedentary", label: "Sedentary (desk job)" },
  { id: "light", label: "Light (1–3 days/week)" },
  { id: "moderate", label: "Moderate (3–5 days/week)" },
  { id: "active", label: "Active (6–7 days/week)" },
  { id: "athlete", label: "Athlete (2x/day)" },
];
const REGIONS = ["Global", "India", "USA", "Europe", "East Asia", "Middle East", "Latin America"];
const CONDITIONS = ["diabetes", "hypertension", "PCOS", "thyroid", "high cholesterol", "kidney disease"];

export default function Onboarding() {
  const { refreshUser } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [p, setP] = useState({
    age: 28, gender: "female", height_cm: 165, weight_kg: 65, target_weight_kg: 60,
    activity_level: "moderate", medical_conditions: [], allergies: [],
    dietary_preference: "vegetarian", daily_budget: 500, region: "Global",
    meal_timings: { breakfast: "08:00", lunch: "13:00", dinner: "19:30" },
    goal: "weight_loss",
    health_concerns: "",
  });

  const toggle = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      await api.post("/profile", p);
      await refreshUser();
      nav("/dashboard");
    } catch (e) { setErr(formatErr(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const steps = [
    { title: "About you", eyebrow: "Step 1 / 4" },
    { title: "Body metrics", eyebrow: "Step 2 / 4" },
    { title: "Lifestyle & diet", eyebrow: "Step 3 / 4" },
    { title: "Your goal", eyebrow: "Step 4 / 4" },
  ];

  return (
    <div className="min-h-screen dotted-bg p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          {steps.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= step ? "bg-[#4A6B53]" : "bg-[#E8E3DF]"}`} />
          ))}
        </div>

        <div className="clay-card p-8 fade-up" data-testid="onboarding-card">
          <span className="eyebrow">{steps[step].eyebrow}</span>
          <h2 className="font-display font-semibold text-3xl mt-2 mb-6" style={{ color: "var(--text)" }}>{steps[step].title}</h2>

          {step === 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="eyebrow block mb-2">Age</label>
                <input data-testid="ob-age" type="number" min={10} max={100} className="input-clay" value={p.age} onChange={(e) => setP({ ...p, age: +e.target.value })} />
              </div>
              <div>
                <label className="eyebrow block mb-2">Gender</label>
                <div className="flex gap-2">
                  {["female", "male"].map((g) => (
                    <button key={g} type="button" data-testid={`ob-gender-${g}`}
                      onClick={() => setP({ ...p, gender: g })}
                      className={`pill-btn flex-1 text-sm ${p.gender === g ? "pill-btn-primary" : "pill-btn-ghost"}`}>
                      {g[0].toUpperCase() + g.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <label className="eyebrow block mb-2">Region</label>
                <select data-testid="ob-region" className="input-clay" value={p.region} onChange={(e) => setP({ ...p, region: e.target.value })}>
                  {REGIONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="eyebrow block mb-2">Height (cm)</label>
                <input data-testid="ob-height" type="number" className="input-clay" value={p.height_cm} onChange={(e) => setP({ ...p, height_cm: +e.target.value })} />
              </div>
              <div>
                <label className="eyebrow block mb-2">Current weight (kg)</label>
                <input data-testid="ob-weight" type="number" className="input-clay" value={p.weight_kg} onChange={(e) => setP({ ...p, weight_kg: +e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="eyebrow block mb-2">Target weight (kg)</label>
                <input data-testid="ob-target-weight" type="number" className="input-clay" value={p.target_weight_kg} onChange={(e) => setP({ ...p, target_weight_kg: +e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="eyebrow block mb-2">Activity level</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ACTIVITY.map((a) => (
                    <button key={a.id} type="button" data-testid={`ob-act-${a.id}`}
                      onClick={() => setP({ ...p, activity_level: a.id })}
                      className={`p-3 rounded-xl border text-sm text-left transition ${p.activity_level === a.id ? "border-[#4A6B53] bg-[#F0F4F1]" : "border-[#E8E3DF] bg-white"}`}>
                      <span className="font-semibold block">{a.label.split("(")[0]}</span>
                      <span className="text-xs" style={{ color: "var(--text-2)" }}>{a.label.match(/\((.+)\)/)?.[1]}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className="eyebrow block mb-2">Dietary preference</label>
                <div className="flex flex-wrap gap-2">
                  {DIETS.map((d) => (
                    <button key={d} type="button" data-testid={`ob-diet-${d}`}
                      onClick={() => setP({ ...p, dietary_preference: d })}
                      className={`pill-btn text-sm ${p.dietary_preference === d ? "pill-btn-primary" : "pill-btn-ghost"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="eyebrow block mb-2">Medical conditions</label>
                <div className="flex flex-wrap gap-2">
                  {CONDITIONS.map((c) => (
                    <button key={c} type="button" data-testid={`ob-cond-${c}`}
                      onClick={() => setP({ ...p, medical_conditions: toggle(p.medical_conditions, c) })}
                      className={`pill-btn text-sm ${p.medical_conditions.includes(c) ? "pill-btn-primary" : "pill-btn-ghost"}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="eyebrow block mb-2">Allergies (comma-separated)</label>
                <input data-testid="ob-allergies" className="input-clay" placeholder="peanuts, shellfish"
                  value={p.allergies.join(", ")} onChange={(e) => setP({ ...p, allergies: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </div>
              <div>
                <label className="eyebrow block mb-2">Other health concerns</label>
                <textarea data-testid="ob-concerns" rows={3}
                  className="input-clay resize-none" style={{ fontFamily: "inherit" }}
                  placeholder="e.g. hair loss, irregular periods, acne, fatigue, bloating, low iron…"
                  value={p.health_concerns}
                  onChange={(e) => setP({ ...p, health_concerns: e.target.value })} />
                <p className="text-xs mt-1.5" style={{ color: "var(--text-2)" }}>
                  Your AI dietitian will target these with specific foods (biotin, iron, omega-3, magnesium, etc.).
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="eyebrow block mb-2">Daily budget</label>
                  <input data-testid="ob-budget" type="number" className="input-clay" value={p.daily_budget} onChange={(e) => setP({ ...p, daily_budget: +e.target.value })} />
                </div>
                <div>
                  <label className="eyebrow block mb-2">Breakfast time</label>
                  <input data-testid="ob-bf-time" type="time" className="input-clay" value={p.meal_timings.breakfast}
                    onChange={(e) => setP({ ...p, meal_timings: { ...p.meal_timings, breakfast: e.target.value } })} />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <label className="eyebrow block mb-3">Pick your primary goal</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {GOALS.map((g) => (
                  <button key={g.id} type="button" data-testid={`ob-goal-${g.id}`}
                    onClick={() => setP({ ...p, goal: g.id })}
                    className={`p-4 rounded-xl border text-sm text-left transition ${p.goal === g.id ? "border-[#4A6B53] bg-[#F0F4F1]" : "border-[#E8E3DF] bg-white"}`}>
                    {p.goal === g.id && <Check size={14} className="inline mr-1" />} {g.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {err && <div className="mt-4 text-sm px-3 py-2 rounded-lg" style={{ background: "#FCE6DF", color: "#A4341B" }}>{err}</div>}

          <div className="flex justify-between mt-8">
            <button type="button" data-testid="ob-back" disabled={step === 0} className="pill-btn pill-btn-ghost flex items-center gap-2 disabled:opacity-40"
              onClick={() => setStep(step - 1)}><ArrowLeft size={14} /> Back</button>
            {step < 3 ? (
              <button type="button" data-testid="ob-next" className="pill-btn pill-btn-primary flex items-center gap-2" onClick={() => setStep(step + 1)}>
                Continue <ArrowRight size={14} />
              </button>
            ) : (
              <button type="button" data-testid="ob-finish" disabled={busy} className="pill-btn pill-btn-primary flex items-center gap-2" onClick={submit}>
                {busy ? "Saving…" : <>Finish <Check size={14} /></>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
