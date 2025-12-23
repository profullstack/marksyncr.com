/**
 * Tests for Stripe integration utilities
 */

import { describe, it, expect } from 'vitest';
import { STRIPE_PRICES, PLAN_FEATURES } from '../lib/stripe.js';

describe('STRIPE_PRICES', () => {
  it('should have pro plan prices', () => {
    expect(STRIPE_PRICES.pro).toBeDefined();
    expect(STRIPE_PRICES.pro.monthly).toBeDefined();
    expect(STRIPE_PRICES.pro.yearly).toBeDefined();
  });

  it('should have team plan prices', () => {
    expect(STRIPE_PRICES.team).toBeDefined();
    expect(STRIPE_PRICES.team.monthly).toBeDefined();
    expect(STRIPE_PRICES.team.yearly).toBeDefined();
  });
});

describe('PLAN_FEATURES', () => {
  describe('free plan', () => {
    it('should have correct name and price', () => {
      expect(PLAN_FEATURES.free.name).toBe('Free');
      expect(PLAN_FEATURES.free.price).toBe(0);
    });

    it('should have features array', () => {
      expect(Array.isArray(PLAN_FEATURES.free.features)).toBe(true);
      expect(PLAN_FEATURES.free.features.length).toBeGreaterThan(0);
    });

    it('should include key free features', () => {
      const features = PLAN_FEATURES.free.features;
      expect(features.some((f) => f.includes('Unlimited bookmarks'))).toBe(true);
      expect(features.some((f) => f.includes('GitHub'))).toBe(true);
      expect(features.some((f) => f.includes('Two-way sync'))).toBe(true);
    });
  });

  describe('pro plan', () => {
    it('should have correct name and pricing', () => {
      expect(PLAN_FEATURES.pro.name).toBe('Pro');
      expect(PLAN_FEATURES.pro.monthlyPrice).toBe(5);
      expect(PLAN_FEATURES.pro.yearlyPrice).toBe(15);
    });

    it('should have features array', () => {
      expect(Array.isArray(PLAN_FEATURES.pro.features)).toBe(true);
      expect(PLAN_FEATURES.pro.features.length).toBeGreaterThan(0);
    });

    it('should include key pro features', () => {
      const features = PLAN_FEATURES.pro.features;
      expect(features.some((f) => f.includes('Cloud storage'))).toBe(true);
      expect(features.some((f) => f.includes('Safari'))).toBe(true);
      expect(features.some((f) => f.includes('Version history'))).toBe(true);
    });
  });

  describe('team plan', () => {
    it('should have correct name and pricing', () => {
      expect(PLAN_FEATURES.team.name).toBe('Team');
      expect(PLAN_FEATURES.team.monthlyPrice).toBe(12);
      expect(PLAN_FEATURES.team.yearlyPrice).toBe(36);
    });

    it('should have features array', () => {
      expect(Array.isArray(PLAN_FEATURES.team.features)).toBe(true);
      expect(PLAN_FEATURES.team.features.length).toBeGreaterThan(0);
    });

    it('should include key team features', () => {
      const features = PLAN_FEATURES.team.features;
      expect(features.some((f) => f.includes('Shared'))).toBe(true);
      expect(features.some((f) => f.includes('Team management'))).toBe(true);
      expect(features.some((f) => f.includes('Admin'))).toBe(true);
    });
  });

  describe('pricing comparison', () => {
    it('should have yearly discount for pro plan', () => {
      const monthlyTotal = PLAN_FEATURES.pro.monthlyPrice * 12;
      expect(PLAN_FEATURES.pro.yearlyPrice).toBeLessThan(monthlyTotal);
    });

    it('should have yearly discount for team plan', () => {
      const monthlyTotal = PLAN_FEATURES.team.monthlyPrice * 12;
      expect(PLAN_FEATURES.team.yearlyPrice).toBeLessThan(monthlyTotal);
    });

    it('should have team plan more expensive than pro', () => {
      expect(PLAN_FEATURES.team.monthlyPrice).toBeGreaterThan(
        PLAN_FEATURES.pro.monthlyPrice
      );
      expect(PLAN_FEATURES.team.yearlyPrice).toBeGreaterThan(
        PLAN_FEATURES.pro.yearlyPrice
      );
    });
  });
});
