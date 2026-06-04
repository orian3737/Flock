import { api } from "./api";

export const getExportPreview = (params) =>
  api.get("/api/export/preview", { params }).then((response) => response.data);

export const generateExport = (payload) =>
  api.post("/api/export/generate", payload, { responseType: "blob" });
