import React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext.jsx";
import { FarmProvider } from "./context/FarmContext.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import ToastContainer from "./components/ToastContainer.jsx";
import { router } from "./router.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <AuthProvider>
        <FarmProvider>
          <RouterProvider router={router} />
        </FarmProvider>
      </AuthProvider>
      <ToastContainer />
    </ToastProvider>
  </React.StrictMode>
);
