import { api } from "./api";

export function createUser(payload) {
  return api.post("/api/users", payload).then((response) => response.data);
}

export function getUserByUid(supabaseUid) {
  return api.get(`/api/users/by-uid/${supabaseUid}`).then((response) => response.data);
}

export function updateUser(userId, payload) {
  return api.put(`/api/users/${userId}`, payload).then((response) => response.data);
}

export function updateUserPreferences(userId, payload) {
  return api.put(`/api/users/${userId}/preferences`, payload).then((response) => response.data);
}
