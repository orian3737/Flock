import { api } from "./api";

export const getInventory = (userId) =>
  api.get(`/api/inventory/${userId}`).then((response) => response.data);

export const getInventoryAlerts = (userId) =>
  api.get(`/api/inventory/alerts/${userId}`).then((response) => response.data);

export const getFeedTransactions = (feedId, params = {}) =>
  api.get(`/api/inventory/feed/${feedId}/transactions`, { params }).then((response) => response.data);

export const purchaseFeed = (payload) =>
  api.post("/api/inventory/purchase", payload).then((response) => response.data);

export const adjustFeed = (payload) =>
  api.post("/api/inventory/adjustment", payload).then((response) => response.data);

export const updateFeed = (feedId, payload) =>
  api.patch(`/api/inventory/feed/${feedId}`, payload).then((response) => response.data);

export const dismissInventoryAlert = (alertId) =>
  api.delete(`/api/inventory/alert/${alertId}`).then((response) => response.data);
