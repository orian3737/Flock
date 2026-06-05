import React from "react";
import { AlertTriangle, CheckCircle, Info, X, XCircle } from "lucide-react";

import { useToast } from "../context/ToastContext";

const toastIcons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

function ToastContainer() {
  const { dismissToast, toasts } = useToast();

  return (
    <div className="toast-container" aria-live="polite" aria-relevant="additions removals">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} onDismiss={() => dismissToast(toast.id)} toast={toast} />
      ))}
    </div>
  );
}

function ToastCard({ onDismiss, toast }) {
  const Icon = toastIcons[toast.type] || Info;
  return (
    <div className={`toast-card ${toast.type || "info"}`}>
      <Icon size={18} aria-hidden="true" />
      <p>{toast.message}</p>
      <button className="toast-dismiss" type="button" onClick={onDismiss} aria-label="Dismiss notification">
        <X size={14} />
      </button>
    </div>
  );
}

export default ToastContainer;
