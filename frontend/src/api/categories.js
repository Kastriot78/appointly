import { http } from "./http";

export function listCategories() {
  return http.get("/api/categories");
}

export function createCategory(body) {
  return http.post("/api/categories", body);
}

export function updateCategory(id, body) {
  return http.put(`/api/categories/${id}`, body);
}

export function deleteCategory(id) {
  return http.delete(`/api/categories/${id}`);
}
