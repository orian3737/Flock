import React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext.jsx";
import { FarmProvider } from "./context/FarmContext.jsx";
import { router } from "./router.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <FarmProvider>
        <RouterProvider router={router} />
      </FarmProvider>
    </AuthProvider>
  </React.StrictMode>
);
