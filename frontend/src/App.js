import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import MealPlan from "@/pages/MealPlan";
import FoodScan from "@/pages/FoodScan";
import Chat from "@/pages/Chat";
import Grocery from "@/pages/Grocery";
import { Toaster } from "sonner";
import "@/App.css";

function Protected({ children, requireProfile = true }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ color: "var(--text-2)" }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (requireProfile && !user.has_profile) return <Navigate to="/onboarding" replace />;
  return children;
}

function Public({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ color: "var(--text-2)" }}>Loading…</div>;
  if (user) return <Navigate to={user.has_profile ? "/dashboard" : "/onboarding"} replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Public><Login /></Public>} />
          <Route path="/register" element={<Public><Register /></Public>} />
          <Route path="/onboarding" element={<Protected requireProfile={false}><Onboarding /></Protected>} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/meal-plan" element={<Protected><MealPlan /></Protected>} />
          <Route path="/scan" element={<Protected><FoodScan /></Protected>} />
          <Route path="/chat" element={<Protected><Chat /></Protected>} />
          <Route path="/grocery" element={<Protected><Grocery /></Protected>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}