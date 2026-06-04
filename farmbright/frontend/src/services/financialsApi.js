import { api } from "./api";

export const getFinancialSummary = (userId, params) =>
  api.get(`/api/financials/summary/${userId}`, { params }).then((response) => response.data);

export const getFlockFinancials = (userId, params) =>
  api.get(`/api/financials/flocks/${userId}`, { params }).then((response) => response.data);

export const createRevenue = (payload) =>
  api.post("/api/financials/revenue", payload).then((response) => response.data);

export const getRevenueHistory = (userId, params) =>
  api.get(`/api/financials/revenue/${userId}`, { params }).then((response) => response.data);
