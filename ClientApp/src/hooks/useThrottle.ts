import { useEffect, useRef, useState } from 'react';

export function useThrottle<T>(value: T, limit: number): T {
  const lastCall = useRef(0);
  const [throttledValue, setThrottledValue] = useState(value);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall.current;

    if (timeSinceLastCall >= limit) {
      lastCall.current = now;
      setThrottledValue(value);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } else {
      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          lastCall.current = Date.now();
          setThrottledValue(value);
          timeoutRef.current = null;
        }, limit - timeSinceLastCall);
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, limit]);

  return throttledValue;
}