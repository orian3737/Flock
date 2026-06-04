import { api } from "./api";

export const getQueue = (userId) => api.get(`/api/scale-house/queue/${userId}`).then((response) => response.data);

export const getQueueSummary = (userId) =>
  api.get(`/api/scale-house/queue/${userId}/summary`).then((response) => response.data);

export const logSession = (payload) =>
  api.post("/api/scale-house/session", payload).then((response) => response.data);

export const getTodayEvents = (userId) =>
  api.get(`/api/scale-house/events/today/${userId}`).then((response) => response.data);

export const deleteEvent = (id) =>
  api.delete(`/api/scale-house/event/${id}`).then((response) => response.data);

export const patchEvent = (id, payload) =>
  api.patch(`/api/scale-house/event/${id}`, payload).then((response) => response.data);

export const getScaleStatus = () =>
  api.get("/api/scale-house/scale/status").then((response) => response.data);

export const openScaleStream = (onReading, onError) => {
  const eventSource = new EventSource("http://localhost:5000/api/scale-house/scale/stream");
  eventSource.onmessage = (event) => onReading(JSON.parse(event.data));
  eventSource.onerror = onError;
  return eventSource;
};
