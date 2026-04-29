import { useState, useEffect, useCallback } from "react";
import { listLocations } from "../api/locations";

export function useLocations() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await listLocations();
      setLocations(Array.isArray(data.locations) ? data.locations : []);
    } catch (e) {
      setError(e);
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { locations, loading, error, refetch };
}
