import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Layout from "@/components/Layout";
import { ShoppingBasket, RefreshCw, Check, ShoppingCart, Copy, Download, X } from "lucide-react";

export default function Grocery() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [checked, setChecked] = useState({});

  // Order cart state
  const [selectedMissing, setSelectedMissing] = useState({}); // { itemName: true }
  const [ordering, setOrdering] = useState(false);
  const [order, setOrder] = useState(null); // last created order, incl. export_text
  const [copyLabel, setCopyLabel] = useState("Copy");

  const generate = async () => {
    setBusy(true); setErr(""); setOrder(null);
    try {
      const { data } = await api.post("/grocery/generate");
      setData(data);
      // default: every missing item pre-selected for ordering
      const initial = {};
      (data.missing_items || []).forEach((name) => { initial[name] = true; });
      setSelectedMissing(initial);
    } catch (e) {
      setErr(e.response?.data?.detail || "Failed. Generate a meal plan first.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { generate(); /* auto-load */ /* eslint-disable-next-line */ }, []);

  const missingItems = data?.missing_items || [];
  const selectedCount = Object.values(selectedMissing).filter(Boolean).length;

  const toggleMissing = (name) => {
    setSelectedMissing({ ...selectedMissing, [name]: !selectedMissing[name] });
  };

  const placeOrder = async () => {
    const items = Object.keys(selectedMissing).filter((k) => selectedMissing[k]);
    if (items.length === 0) return;
    setOrdering(true); setErr("");
    try {
      const { data: newOrder } = await api.post("/grocery/order", { items });
      setOrder(newOrder);
      setCopyLabel("Copy");
    } catch (e) {
      setErr(e.response?.data?.detail || "Couldn't create order. Try again.");
    } finally {
      setOrdering(false);
    }
  };

  const copyExport = async () => {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(order.export_text);
      setCopyLabel("Copied!");
      setTimeout(() => setCopyLabel("Copy"), 1500);
    } catch {
      setCopyLabel("Couldn't copy");
    }
  };

  const downloadExport = () => {
    if (!order) return;
    const blob = new Blob([order.export_text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forkfit-order-${order.id.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6 fade-up">
        <div>
          <span className="eyebrow">Smart shopping</span>
          <h1 className="font-display font-bold text-4xl sm:text-5xl mt-1" style={{ color: "var(--text)" }}>Grocery list</h1>
        </div>
        <button data-testid="grocery-regen" onClick={generate} disabled={busy} className="pill-btn pill-btn-primary flex items-center gap-2">
          <RefreshCw size={14} /> {busy ? "Building…" : "Regenerate"}
        </button>
      </div>

      {err && <div className="text-sm mb-4 px-3 py-2 rounded-lg" style={{ background: "#FCE6DF", color: "#A4341B" }}>{err}</div>}

      {!data && !busy && (
        <div className="clay-card p-12 text-center">
          <ShoppingBasket size={36} className="mx-auto mb-3" style={{ color: "var(--primary)" }} />
          <p className="text-sm" style={{ color: "var(--text-2)" }}>Generate a meal plan first, then we'll create your shopping list.</p>
        </div>
      )}

      {/* Missing-from-pantry / order panel */}
      {data?.categories && missingItems.length > 0 && (
        <div className="clay-card p-6 mb-6 fade-up" data-testid="missing-panel">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="eyebrow">Not in your pantry</span>
              <p className="text-sm mt-1" style={{ color: "var(--text-2)" }}>
                {missingItems.length} item{missingItems.length !== 1 ? "s" : ""} you'll likely need to buy. Uncheck anything you don't want to order.
              </p>
            </div>
            <button
              onClick={placeOrder}
              disabled={ordering || selectedCount === 0}
              data-testid="order-missing-btn"
              className="pill-btn pill-btn-primary flex items-center gap-2 shrink-0"
            >
              <ShoppingCart size={14} /> {ordering ? "Ordering…" : `Order (${selectedCount})`}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {missingItems.map((name) => (
              <button
                key={name}
                onClick={() => toggleMissing(name)}
                data-testid={`missing-${name}`}
                className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border transition"
                style={{
                  borderColor: selectedMissing[name] ? "var(--primary)" : "#E8E3DF",
                  background: selectedMissing[name] ? "rgba(74,107,83,0.08)" : "transparent",
                  color: selectedMissing[name] ? "var(--text)" : "var(--text-2)",
                }}
              >
                <span className={`w-4 h-4 rounded-md border flex items-center justify-center ${selectedMissing[name] ? "bg-[#4A6B53] border-[#4A6B53]" : "border-[#E8E3DF]"}`}>
                  {selectedMissing[name] && <Check size={10} color="white" />}
                </span>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Order confirmation / export panel */}
      {order && (
        <div className="clay-card p-6 mb-6 fade-up" data-testid="order-confirm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="eyebrow">Order saved</span>
              <p className="text-sm mt-1" style={{ color: "var(--text-2)" }}>
                Status: {order.status}. Copy or download this list to place it with your grocery app of choice.
              </p>
            </div>
            <button onClick={() => setOrder(null)} className="p-1 rounded-full hover:bg-black/5" aria-label="Dismiss">
              <X size={16} style={{ color: "var(--text-2)" }} />
            </button>
          </div>
          <pre
            className="text-sm p-3 rounded-lg whitespace-pre-wrap mb-3"
            style={{ background: "var(--bg-2, #F7F4F0)", color: "var(--text)" }}
          >
            {order.export_text}
          </pre>
          <div className="flex gap-2">
            <button onClick={copyExport} className="pill-btn flex items-center gap-2">
              <Copy size={14} /> {copyLabel}
            </button>
            <button onClick={downloadExport} className="pill-btn flex items-center gap-2">
              <Download size={14} /> Download .txt
            </button>
          </div>
        </div>
      )}

      {data?.categories && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.categories.map((cat, i) => (
            <div key={i} className="clay-card p-6 fade-up" data-testid={`cat-${i}`}>
              <span className="eyebrow">{cat.name}</span>
              <ul className="mt-3 space-y-2">
                {cat.items.map((it, j) => {
                  const key = `${i}-${j}`;
                  const name = it.name ?? it; // tolerate old string-array shape too
                  const inStock = it.in_stock ?? true;
                  return (
                    <li key={j}>
                      <button onClick={() => setChecked({ ...checked, [key]: !checked[key] })}
                        data-testid={`item-${i}-${j}`}
                        className="w-full text-left flex items-center gap-3 text-sm py-1">
                        <span className={`w-5 h-5 rounded-md border flex items-center justify-center transition ${checked[key] ? "bg-[#4A6B53] border-[#4A6B53]" : "border-[#E8E3DF]"}`}>
                          {checked[key] && <Check size={12} color="white" />}
                        </span>
                        <span className={checked[key] ? "line-through" : ""} style={{ color: checked[key] ? "var(--text-2)" : "var(--text)" }}>
                          {name}
                        </span>
                        {!inStock && !checked[key] && (
                          <span
                            className="ml-auto text-[10px] px-2 py-0.5 rounded-full shrink-0"
                            style={{ background: "#FCE6DF", color: "#A4341B" }}
                          >
                            buy
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}