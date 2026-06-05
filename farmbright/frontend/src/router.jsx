import React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import AppLayout from "./components/AppLayout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Login from "./pages/auth/Login.jsx";
import Dashboard from "./pages/dashboard/Dashboard.jsx";
import Financials from "./pages/finances/Financials.jsx";
import FlockDetail from "./pages/flocks/FlockDetail.jsx";
import FlockList from "./pages/flocks/FlockList.jsx";
import Inventory from "./pages/inventory/Inventory.jsx";
import OnboardingWizard from "./pages/onboarding/OnboardingWizard.jsx";
import ScaleHouse from "./pages/scale-house/ScaleHouse.jsx";
import Export from "./pages/reports/Export.jsx";
import FarmSetup from "./pages/settings/FarmSetup.jsx";
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
          { path: "flocks", element: <FlockList /> },
          { path: "flocks/:id", element: <FlockDetail /> },
          { path: "scale-house", element: <ScaleHouse /> },
          { path: "inventory", element: <Inventory /> },
          { path: "financials", element: <Financials /> },
          { path: "export", element: <Export /> },
          { path: "farm-setup", element: <FarmSetup /> },
          { path: "settings", element: <Settings /> },
        ],
      },
    ],
  },
]);
