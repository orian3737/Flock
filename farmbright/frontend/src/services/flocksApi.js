import { api } from "./api";

export const getFlocks = (userId) =>
  api.get(`/api/flocks/${userId}`).then((response) => response.data);

export const getFlockDetail = (flockId) =>
  api.get(`/api/flocks/${flockId}/detail`).then((response) => response.data);

export const getFeedingHistory = (flockId, params = {}) =>
  api.get(`/api/flocks/${flockId}/feeding-history`, { params }).then((response) => response.data);

export const getProductionHistory = (flockId, params = {}) =>
  api.get(`/api/flocks/${flockId}/production-history`, { params }).then((response) => response.data);

export const logProduction = (flockId, payload) =>
  api.post(`/api/flocks/${flockId}/production`, payload).then((response) => response.data);

export const logCasualty = (flockId, payload) =>
  api.post(`/api/flocks/${flockId}/casualty`, payload).then((response) => response.data);
