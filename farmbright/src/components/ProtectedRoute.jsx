import React from "react";
import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

function AuthLoadingScreen() {
  return (
    <div className="route-loading">
      <div className="route-spinner" aria-hidden="true" />
      <div>Loading...</div>
    </div>
  );
}

export function ProtectedRoute() {
  const { user, loading, isOnboarded } = useAuth();

  if (loading) return <AuthLoadingScreen />;
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!isOnboarded) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

export function OnboardingRoute() {
  const { user, loading, isOnboarded } = useAuth();

  if (loading) return <AuthLoadingScreen />;
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (isOnboarded) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
