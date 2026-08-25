import { useState, useCallback } from 'react';
import type { ValidationError, ApiError } from '../lib/api';

export function useValidationErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setFromApiError = useCallback((err: unknown) => {
    if (err instanceof Error) {
      const apiErr = err as ApiError;
      if (apiErr.validationErrors && apiErr.validationErrors.length > 0) {
        const mapped: Record<string, string> = {};
        for (const ve of apiErr.validationErrors) {
          const key = ve.field.toLowerCase().replace(/\s+/g, '');
          mapped[key] = ve.message;
        }
        setErrors(mapped);
        return;
      }
    }
    setErrors({});
  }, []);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  const setFieldError = useCallback((field: string, message: string) => {
    setErrors(prev => ({ ...prev, [field.toLowerCase().replace(/\s+/g, '')]: message }));
  }, []);

  const clearFieldError = useCallback((field: string) => {
    setErrors(prev => {
      const key = field.toLowerCase().replace(/\s+/g, '');
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const getError = useCallback((field: string) => {
    return errors[field.toLowerCase().replace(/\s+/g, '')];
  }, [errors]);

  const hasErrors = Object.keys(errors).length > 0;

  return {
    errors,
    setErrors,
    setFromApiError,
    clearErrors,
    setFieldError,
    clearFieldError,
    getError,
    hasErrors,
  };
}

export function mapValidationErrors(apiErrors: ValidationError[]): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const ve of apiErrors) {
    const key = ve.field.toLowerCase().replace(/\s+/g, '');
    mapped[key] = ve.message;
  }
  return mapped;
}