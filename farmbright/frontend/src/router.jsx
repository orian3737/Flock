import React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import AppLayout from "./components/AppLayout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Login from "./pages/auth/Login.jsx";
import Dashboard from "./pages/dashboard/Dashboard.jsx";
import Financials from "./pages/finances/Financials.jsx";
import Inventory from "./pages/inventory/Inventory.jsx";
import OnboardingWizard from "./pages/onboarding/OnboardingWizard.jsx";
import ScaleHouse from "./pages/scale-house/ScaleHouse.jsx";
import Export from "./pages/reports/Export.jsx";
import Settings from "./pages/settings/Settings.jsx";

export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/onboarding", element: <OnboardingWizard /> },
  {
    path: "/",
    element: <ProtectedRoute />,
    children: [
      {
        path: "",
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: "dashboard", element: <Dashboard /> },
          { path: "flocks", element: <div className="panel-card">Flocks coming soon</div> },
          { path: "flocks/:id", element: <div className="panel-card">Flock detail coming soon</div> },
          { path: "scale-house", element: <ScaleHouse /> },
          { path: "inventory", element: <Inventory /> },
          { path: "financials", element: <Financials /> },
          { path: "export", element: <Export /> },
          { path: "settings", element: <Settings /> },
        ],
      },
    ],
  },
]);
