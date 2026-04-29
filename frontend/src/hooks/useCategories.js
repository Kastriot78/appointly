import { useState, useEffect, useCallback } from "react";
import { listCategories } from "../api/categories";


export function useCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await listCategories();
      setCategories(Array.isArray(data.categories) ? data.categories : []);
    } catch (e) {
      setError(e);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { categories, loading, error, refetch };
}
