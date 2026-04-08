"use client";

import { useState, useCallback, useRef } from "react";
import { geocodeAddress, type GeocodedAddress } from "@/lib/geocode";

export function useGeocode() {
  const [geocoding, setGeocoding] = useState(false);
  const lastSuccessRef = useRef<string>("");

  const geocode = useCallback(async (address: string): Promise<GeocodedAddress | null> => {
    const trimmed = address.trim();
    if (!trimmed || trimmed.length < 5) return null;

    if (trimmed === lastSuccessRef.current) return null;

    setGeocoding(true);

    try {
      const result = await geocodeAddress(trimmed);
      if (result) {
        lastSuccessRef.current = trimmed;
      }
      return result;
    } finally {
      setGeocoding(false);
    }
  }, []);

  return { geocode, geocoding };
}
