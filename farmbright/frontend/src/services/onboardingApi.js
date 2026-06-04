import { api } from "./api";

export function createAnimalClass(payload) {
  return api.post("/api/onboarding/animal-class", payload).then((response) => response.data);
}

export function updateAnimalClass(id, payload) {
  return api.patch(`/api/onboarding/animal-class/${id}`, payload).then((response) => response.data);
}

export function deleteAnimalClass(id) {
  return api.delete(`/api/onboarding/animal-class/${id}`).then((response) => response.data);
}

export function createBreed(payload) {
  return api.post("/api/onboarding/breed", payload).then((response) => response.data);
}

export function updateBreed(id, payload) {
  return api.patch(`/api/onboarding/breed/${id}`, payload).then((response) => response.data);
}

export function deleteBreed(id) {
  return api.delete(`/api/onboarding/breed/${id}`).then((response) => response.data);
}

export function createFlock(payload) {
  return api.post("/api/onboarding/flock", payload).then((response) => response.data);
}

export function updateFlock(id, payload) {
  return api.patch(`/api/onboarding/flock/${id}`, payload).then((response) => response.data);
}

export function deleteFlock(id) {
  return api.delete(`/api/onboarding/flock/${id}`).then((response) => response.data);
}

export function createFeedType(payload) {
  return api.post("/api/onboarding/feed-type", payload).then((response) => response.data);
}

export function updateFeedType(id, payload) {
  return api.patch(`/api/onboarding/feed-type/${id}`, payload).then((response) => response.data);
}

export function deleteFeedType(id) {
  return api.delete(`/api/onboarding/feed-type/${id}`).then((response) => response.data);
}

export function createFeedAssignment(payload) {
  return api.post("/api/onboarding/feed-assignment", payload).then((response) => response.data);
}

export function deleteFeedAssignment(id) {
  return api.delete(`/api/onboarding/feed-assignment/${id}`).then((response) => response.data);
}

export function getOnboardingSummary(userId) {
  return api.get(`/api/onboarding/summary/${userId}`).then((response) => response.data);
}
