import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      setStoredValue(prevValue => {
        const valueToStore =
          value instanceof Function ? value(prevValue) : value;
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
        return valueToStore;
      });
    } catch {
      // Storage write failed (e.g. quota exceeded or private mode) — silently ignore
    }
  };

  return [storedValue, setValue];
}