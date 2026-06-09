import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "./components/AppLayout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { FarmProvider } from "./context/FarmContext.jsx";
import Login from "./pages/auth/Login.jsx";
import ResetPassword from "./pages/auth/ResetPassword.jsx";
import Dashboard from "./pages/dashboard/Dashboard.jsx";
import Financials from "./pages/finances/Financials.jsx";
import FlockDetail from "./pages/flocks/FlockDetail.jsx";
import FlockList from "./pages/flocks/FlockList.jsx";
import Inventory from "./pages/inventory/Inventory.jsx";
import OnboardingWizard from "./pages/onboarding/OnboardingWizard.jsx";
import Export from "./pages/reports/Export.jsx";
import ScaleHouse from "./pages/scale-house/ScaleHouse.jsx";
import FarmLog from "./pages/log/FarmLog.jsx";
import FarmSetup from "./pages/settings/FarmSetup.jsx";
import Settings from "./pages/settings/Settings.jsx";
import "./index.css";

export function App() {
  return (
    <AuthProvider>
      <FarmProvider>
        <div data-theme="farmbright">
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/onboarding" element={<OnboardingWizard />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/flocks" element={<FlockList />} />
                  <Route path="/flocks/:id" element={<FlockDetail />} />
                  <Route path="/log" element={<FarmLog />} />
                  <Route path="/scale-house" element={<ScaleHouse />} />
                  <Route path="/inventory" element={<Inventory />} />
                  <Route path="/financials" element={<Financials />} />
                  <Route path="/export" element={<Export />} />
                  <Route path="/farm-setup" element={<FarmSetup />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </div>
      </FarmProvider>
    </AuthProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
