import { describe, it, expect } from 'vitest';
import { cn, formatCurrency, formatTime } from '@/lib/utils';

describe('utils', () => {
  describe('cn', () => {
    it('merges Tailwind classes', () => {
      expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
    });

    it('handles conditional classes', () => {
      expect(cn('base', false && 'hidden', 'extra')).toBe('base extra');
    });

    it('handles undefined values', () => {
      expect(cn('base', undefined, null, 'extra')).toBe('base extra');
    });
  });

  describe('formatCurrency', () => {
    it('formats BRL currency', () => {
      const result = formatCurrency(1500.5);
      expect(result).toContain('1.500');
    });

    it('formats zero', () => {
      expect(formatCurrency(0)).toContain('0');
    });
  });

  describe('formatTime', () => {
    it('formats ISO date string', () => {
      const result = formatTime('2026-06-03T12:00:00Z');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles invalid date gracefully', () => {
      let result = '';
      try {
        result = formatTime('invalid');
      } catch {
        result = '';
      }
      expect(result).toBe('');
    });
  });
});
