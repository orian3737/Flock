import { api } from "./api";

export async function getDashboardOverview(userId) {
  const response = await api.get(`/api/dashboard/overview/${userId}`);
  return response.data;
}

export async function dismissInventoryAlert(alertId) {
  const response = await api.delete(`/api/inventory/alert/${alertId}`);
  return response.data;
}
