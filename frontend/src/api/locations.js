import { http } from "./http";

export function listLocations() {
  return http.get("/api/locations");
}

export function createLocation(body) {
  return http.post("/api/locations", body);
}

export function updateLocation(id, body) {
  return http.put(`/api/locations/${id}`, body);
}

export function deleteLocation(id) {
  return http.delete(`/api/locations/${id}`);
}
