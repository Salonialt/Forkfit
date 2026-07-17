import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import Layout from "@/components/Layout";
import { Camera, Upload, Sparkles, Check, Video, VideoOff, Image as ImageIcon } from "lucide-react";

const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner"];

function UploadMode() {
  const inputRef = useRef();
  const [imgB64, setImgB64] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mime, setMime] = useState("image/jpeg");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [mealType, setMealType] = useState("snack");
  const [logged, setLogged] = useState(false);

  const handleFile = (file) => {
    if (!file) return;
    setMime(file.type);
    setResult(null); setLogged(false); setErr("");
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target.result);
      setImgB64(e.target.result.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const analyze = async () => {
    if (!imgB64) return;
    setBusy(true); setErr(""); setResult(null);
    try {
      const { data } = await api.post("/food/analyze", { image_base64: imgB64, mime });
      // Guard against low-confidence / non-food responses
      const looksValid = data && typeof data.calories === "number" && data.calories > 0 && data.food_name;
      if (!looksValid) {
        setErr("Couldn't confidently identify the food. Try a clearer, well-lit photo of a single dish.");
      } else {
        setResult(data);
      }
    } catch (e) {
      const detail = e.response?.data?.detail;
      const isVisionFail = typeof detail === "string" && /could not analyze|parse|identify/i.test(detail);
      if (isVisionFail || !detail) {
        setErr("Couldn't confidently identify the food. Try a clearer, well-lit photo of a single dish.");
      } else {
        setErr(typeof detail === "string" ? detail : "Couldn't analyze. Please try a different image.");
      }
    } finally { setBusy(false); }
  };

  const log = async () => {
    if (!result) return;
    await api.post("/log/food", {
      food_name: result.food_name, calories: result.calories,
      protein_g: result.protein_g || 0, carbs_g: result.carbs_g || 0,
      fat_g: result.fat_g || 0, fiber_g: result.fiber_g || 0,
      sugar_g: result.sugar_g || 0, sodium_mg: result.sodium_mg || 0,
      meal_type: mealType, portion: result.portion || ""
    });
    setLogged(true);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="clay-card p-6 fade-up delay-1">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp"
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          onChange={(e) => handleFile(e.target.files[0])} data-testid="file-input" />
        {!preview ? (
          <div onClick={() => inputRef.current?.click()} data-testid="upload-zone"
            className="border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition hover:bg-[#F4F2EE]"
            style={{ borderColor: "var(--border)" }}>
            <Camera size={36} className="mx-auto mb-3" style={{ color: "var(--primary)" }} />
            <p className="font-display font-semibold text-lg" style={{ color: "var(--text)" }}>Tap to upload</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-2)" }}>JPEG, PNG, WEBP</p>
          </div>
        ) : (
          <div>
            <img src={preview} alt="" className="rounded-2xl w-full max-h-96 object-cover" data-testid="img-preview" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => inputRef.current?.click()} className="pill-btn pill-btn-ghost text-sm flex-1 flex items-center justify-center gap-2" data-testid="change-img-btn">
                <Upload size={14} /> Change
              </button>
              <button onClick={analyze} disabled={busy} data-testid="analyze-btn"
                className="pill-btn pill-btn-primary text-sm flex-1 flex items-center justify-center gap-2">
                <Sparkles size={14} /> {busy ? "Analyzing…" : "Analyze"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="clay-card p-6 fade-up delay-2" data-testid="result-card">
        <span className="eyebrow">Result</span>
        {!result && !busy && <p className="text-sm mt-6" style={{ color: "var(--text-2)" }}>Upload an image and tap Analyze to see the nutrition breakdown.</p>}
        {err && <p className="text-sm mt-4 px-3 py-2 rounded-lg" style={{ background: "#FCE6DF", color: "#A4341B" }}>{err}</p>}
        {busy && <p className="text-sm mt-6 animate-pulse" style={{ color: "var(--text-2)" }}>GPT-4o is identifying your meal…</p>}

        {result && (
          <div className="mt-4">
            <h3 className="font-display font-semibold text-2xl" style={{ color: "var(--text)" }} data-testid="result-name">{result.food_name}</h3>
            <p className="text-sm" style={{ color: "var(--text-2)" }}>{result.portion}</p>
            <div className="grid grid-cols-2 gap-3 mt-5">
              {[
                { l: "Calories", v: (result.calories ?? 0) + " kcal", c: "var(--primary)" },
                { l: "Protein", v: (result.protein_g ?? 0) + "g", c: "var(--terracotta)" },
                { l: "Carbs", v: (result.carbs_g ?? 0) + "g", c: "var(--ochre)" },
                { l: "Fat", v: (result.fat_g ?? 0) + "g", c: "var(--water)" },
                { l: "Fiber", v: (result.fiber_g ?? 0) + "g", c: "var(--text-2)" },
                { l: "Sugar", v: (result.sugar_g ?? 0) + "g", c: "var(--text-2)" },
              ].map((it) => (
                <div key={it.l} className="rounded-xl p-3" style={{ background: "#F4F2EE" }}>
                  <div className="eyebrow text-[10px]" style={{ color: it.c }}>{it.l}</div>
                  <div className="font-display font-bold text-lg mt-1" style={{ color: "var(--text)" }}>{it.v}</div>
                </div>
              ))}
            </div>
            {result.notes && <p className="text-xs mt-3" style={{ color: "var(--text-2)" }}>{result.notes}</p>}
            <div className="mt-5">
              <span className="eyebrow block mb-2">Log as</span>
              <div className="flex gap-2 flex-wrap">
                {MEAL_TYPES.map((m) => (
                  <button key={m} data-testid={`meal-type-${m}`} onClick={() => setMealType(m)}
                    className={`pill-btn text-xs ${mealType === m ? "pill-btn-primary" : "pill-btn-ghost"}`}>{m}</button>
                ))}
              </div>
              <button onClick={log} disabled={logged} data-testid="log-result-btn"
                className="pill-btn pill-btn-primary w-full mt-4 flex items-center justify-center gap-2">
                {logged ? <><Check size={14} /> Added to diary</> : "Log to diary"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LiveMode() {
  const videoRef = useRef();
  const canvasRef = useRef();
  const captureRef = useRef();
  const wrapRef = useRef();
  const [active, setActive] = useState(false);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const itemsRef = useRef([]);
  const activeRef = useRef(false);
  itemsRef.current = items;

  const start = async () => {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      activeRef.current = true;
      setActive(true);
      loop();
      drawLoop();
    } catch (e) {
      setErr("Camera access denied or unavailable.");
    }
  };

  const stop = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    const s = videoRef.current?.srcObject;
    if (s) s.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setItems([]);
  }, []);

  // Capture a frame and POST to /food/detect every ~2s
  const loop = async () => {
    let inFlight = false;
    while (activeRef.current) {
      try {
        const v = videoRef.current;
        if (!v || v.readyState < 2 || inFlight) { await new Promise((r) => setTimeout(r, 500)); continue; }
        const cap = captureRef.current;
        cap.width = 640;
        cap.height = Math.round((v.videoHeight / v.videoWidth) * 640) || 480;
        const cx = cap.getContext("2d");
        cx.drawImage(v, 0, 0, cap.width, cap.height);
        const dataUrl = cap.toDataURL("image/jpeg", 0.7);
        const b64 = dataUrl.split(",")[1];
        inFlight = true;
        setBusy(true);
        const { data } = await api.post("/food/detect", { image_base64: b64, mime: "image/jpeg" });
        setBusy(false);
        inFlight = false;
        if (activeRef.current) setItems(data.items || []);
      } catch (e) {
        setBusy(false);
        inFlight = false;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  };

  // Draw bounding boxes on overlay canvas at 60fps from latest items
  const drawLoop = () => {
    const draw = () => {
      if (!activeRef.current) return;
      const v = videoRef.current;
      const c = canvasRef.current;
      const wrap = wrapRef.current;
      if (v && c && wrap && v.videoWidth) {
        const rect = wrap.getBoundingClientRect();
        c.width = rect.width;
        c.height = rect.height;
        const ctx = c.getContext("2d");
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.lineWidth = 3;
        ctx.font = "600 14px Manrope, sans-serif";
        for (const it of itemsRef.current) {
          if (!it.box) continue;
          const { x, y, w, h } = it.box;
          const px = x * c.width, py = y * c.height, pw = w * c.width, ph = h * c.height;
          const color = it.fit ? "#4A6B53" : "#D96C51";
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
          // box with corner ticks
          ctx.strokeRect(px, py, pw, ph);
          // label background
          const label = `${it.name}${typeof it.calories === "number" ? ` · ${it.calories}kcal` : ""}`;
          const padX = 8, padY = 5;
          const tw = ctx.measureText(label).width + padX * 2;
          const th = 24;
          const ly = py - th < 0 ? py + ph : py - th;
          ctx.fillRect(px, ly, tw, th);
          ctx.fillStyle = "#fff";
          ctx.fillText(label, px + padX, ly + th - padY - 2);
        }
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  };

  useEffect(() => () => stop(), [stop]); // cleanup on unmount

  const logAll = async () => {
    for (const it of items.filter((x) => x.fit)) {
      await api.post("/log/food", {
        food_name: it.name, calories: it.calories || 0,
        protein_g: it.protein_g || 0, carbs_g: it.carbs_g || 0, fat_g: it.fat_g || 0,
        meal_type: "snack",
      });
    }
    alert("Diet-fit items logged to your diary");
  };

  const fitCount = items.filter((x) => x.fit).length;
  const unfitCount = items.length - fitCount;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="clay-card p-3 lg:col-span-2 fade-up overflow-hidden" data-testid="live-card">
        <div ref={wrapRef} className="relative w-full rounded-xl overflow-hidden" style={{ background: "#1E2B22", aspectRatio: "16 / 10" }}>
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" data-testid="live-video" />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" data-testid="live-canvas" />
          {!active && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90 gap-3">
              <Video size={40} />
              <p className="font-display font-semibold">Live Diet Scan</p>
              <p className="text-xs opacity-70 max-w-xs text-center">Point your camera at your plate. We'll outline foods in <span className="text-[#9EE0AD] font-semibold">green</span> if they fit your diet and <span className="text-[#F8AE99] font-semibold">red</span> if they don't.</p>
            </div>
          )}
          {active && busy && (
            <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2" style={{ background: "rgba(255,255,255,0.9)", color: "var(--text)" }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--terracotta)" }} /> Scanning…
            </div>
          )}
        </div>
        <canvas ref={captureRef} className="hidden" />
        <div className="flex gap-2 mt-3">
          {!active ? (
            <button onClick={start} data-testid="live-start" className="pill-btn pill-btn-primary flex-1 flex items-center justify-center gap-2">
              <Video size={14} /> Start Live Scan
            </button>
          ) : (
            <>
              <button onClick={stop} data-testid="live-stop" className="pill-btn pill-btn-ghost flex-1 flex items-center justify-center gap-2">
                <VideoOff size={14} /> Stop
              </button>
              <button onClick={logAll} disabled={fitCount === 0} data-testid="live-log-fit" className="pill-btn pill-btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40">
                <Check size={14} /> Log {fitCount} fit item{fitCount !== 1 ? "s" : ""}
              </button>
            </>
          )}
        </div>
        {err && <p className="text-sm mt-3 px-3 py-2 rounded-lg" style={{ background: "#FCE6DF", color: "#A4341B" }}>{err}</p>}
      </div>

      <div className="clay-card p-6 fade-up delay-1" data-testid="live-results">
        <div className="flex items-center justify-between mb-3">
          <span className="eyebrow">Detected items</span>
          <div className="flex gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: "#E6EFE8", color: "var(--primary)" }}>{fitCount} fit</span>
            <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: "#FCE6DF", color: "#A4341B" }}>{unfitCount} skip</span>
          </div>
        </div>
        {items.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-2)" }}>Items detected by the camera will appear here with diet-fit verdicts.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="p-3 rounded-xl border" style={{ borderColor: it.fit ? "#4A6B53" : "#D96C51", background: it.fit ? "#F1F6F2" : "#FCEFEA" }}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm capitalize" style={{ color: "var(--text)" }}>{it.name}</span>
                  <span className="text-xs font-bold" style={{ color: it.fit ? "var(--primary)" : "#A4341B" }}>{it.fit ? "FIT" : "SKIP"}</span>
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--text-2)" }}>
                  {it.calories ? `${it.calories} kcal · ` : ""}{it.reason}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function FoodScan() {
  const [tab, setTab] = useState("upload");

  return (
    <Layout>
      <div className="mb-6 fade-up">
        <span className="eyebrow">Vision AI · GPT-4o</span>
        <h1 className="font-display font-bold text-4xl sm:text-5xl mt-1" style={{ color: "var(--text)" }}>Snap your meal</h1>
        <p className="mt-2 text-base" style={{ color: "var(--text-2)" }}>
          Use the live camera for real-time diet-fit detection, or upload a single photo for a deep nutrition breakdown.
        </p>
      </div>

      <div className="inline-flex p-1 rounded-full mb-6" style={{ background: "#EFEDE9" }}>
        <button data-testid="tab-live" onClick={() => setTab("live")}
          className={`pill-btn text-sm flex items-center gap-2 ${tab === "live" ? "pill-btn-primary" : ""}`}>
          <Video size={14} /> Live Camera
        </button>
        <button data-testid="tab-upload" onClick={() => setTab("upload")}
          className={`pill-btn text-sm flex items-center gap-2 ${tab === "upload" ? "pill-btn-primary" : ""}`}>
          <ImageIcon size={14} /> Upload Photo
        </button>
      </div>

      {tab === "live" ? <LiveMode /> : <UploadMode />}
    </Layout>
  );
}
