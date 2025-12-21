import { describe, it, expect } from 'vitest';
import {
  SUBSCRIPTION_PLAN,
  SUBSCRIPTION_STATUS,
  PLAN_FEATURES,
  hasActiveSubscription,
  canUseCloudStorage,
  getSyncInterval,
  createUser,
} from '../src/user.js';

describe('user types', () => {
  describe('constants', () => {
    it('should have correct SUBSCRIPTION_PLAN values', () => {
      expect(SUBSCRIPTION_PLAN.FREE).toBe('free');
      expect(SUBSCRIPTION_PLAN.PRO).toBe('pro');
      expect(SUBSCRIPTION_PLAN.TEAM).toBe('team');
    });

    it('should have correct SUBSCRIPTION_STATUS values', () => {
      expect(SUBSCRIPTION_STATUS.ACTIVE).toBe('active');
      expect(SUBSCRIPTION_STATUS.CANCELED).toBe('canceled');
      expect(SUBSCRIPTION_STATUS.PAST_DUE).toBe('past_due');
      expect(SUBSCRIPTION_STATUS.TRIALING).toBe('trialing');
    });
  });

  describe('PLAN_FEATURES', () => {
    it('should have features for all plans', () => {
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.FREE]).toBeDefined();
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.PRO]).toBeDefined();
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.TEAM]).toBeDefined();
    });

    it('should have correct pricing', () => {
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.FREE].price).toBe(0);
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.PRO].price).toBe(5);
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.TEAM].price).toBe(15);
    });

    it('should have cloud storage only for paid plans', () => {
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.FREE].cloudStorage).toBe(false);
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.PRO].cloudStorage).toBe(true);
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.TEAM].cloudStorage).toBe(true);
    });

    it('should have increasing device limits', () => {
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.FREE].maxDevices).toBe(2);
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.PRO].maxDevices).toBe(10);
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.TEAM].maxDevices).toBe(-1); // unlimited
    });

    it('should have decreasing sync intervals for higher tiers', () => {
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.FREE].syncInterval).toBe(30);
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.PRO].syncInterval).toBe(5);
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.TEAM].syncInterval).toBe(1);
    });

    it('should include supabase-cloud source only for paid plans', () => {
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.FREE].sources).not.toContain('supabase-cloud');
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.PRO].sources).toContain('supabase-cloud');
      expect(PLAN_FEATURES[SUBSCRIPTION_PLAN.TEAM].sources).toContain('supabase-cloud');
    });
  });

  describe('hasActiveSubscription', () => {
    it('should return false for null subscription', () => {
      expect(hasActiveSubscription(null)).toBe(false);
    });

    it('should return true for active subscription', () => {
      const subscription = {
        status: SUBSCRIPTION_STATUS.ACTIVE,
        plan: SUBSCRIPTION_PLAN.PRO,
      };
      expect(hasActiveSubscription(subscription)).toBe(true);
    });

    it('should return true for trialing subscription', () => {
      const subscription = {
        status: SUBSCRIPTION_STATUS.TRIALING,
        plan: SUBSCRIPTION_PLAN.PRO,
      };
      expect(hasActiveSubscription(subscription)).toBe(true);
    });

    it('should return false for canceled subscription', () => {
      const subscription = {
        status: SUBSCRIPTION_STATUS.CANCELED,
        plan: SUBSCRIPTION_PLAN.PRO,
      };
      expect(hasActiveSubscription(subscription)).toBe(false);
    });

    it('should return false for past_due subscription', () => {
      const subscription = {
        status: SUBSCRIPTION_STATUS.PAST_DUE,
        plan: SUBSCRIPTION_PLAN.PRO,
      };
      expect(hasActiveSubscription(subscription)).toBe(false);
    });
  });

  describe('canUseCloudStorage', () => {
    it('should return false for null subscription', () => {
      expect(canUseCloudStorage(null)).toBe(false);
    });

    it('should return false for free plan', () => {
      const subscription = {
        status: SUBSCRIPTION_STATUS.ACTIVE,
        plan: SUBSCRIPTION_PLAN.FREE,
      };
      expect(canUseCloudStorage(subscription)).toBe(false);
    });

    it('should return true for active pro subscription', () => {
      const subscription = {
        status: SUBSCRIPTION_STATUS.ACTIVE,
        plan: SUBSCRIPTION_PLAN.PRO,
      };
      expect(canUseCloudStorage(subscription)).toBe(true);
    });

    it('should return true for active team subscription', () => {
      const subscription = {
        status: SUBSCRIPTION_STATUS.ACTIVE,
        plan: SUBSCRIPTION_PLAN.TEAM,
      };
      expect(canUseCloudStorage(subscription)).toBe(true);
    });

    it('should return false for canceled pro subscription', () => {
      const subscription = {
        status: SUBSCRIPTION_STATUS.CANCELED,
        plan: SUBSCRIPTION_PLAN.PRO,
      };
      expect(canUseCloudStorage(subscription)).toBe(false);
    });

    it('should return true for trialing pro subscription', () => {
      const subscription = {
        status: SUBSCRIPTION_STATUS.TRIALING,
        plan: SUBSCRIPTION_PLAN.PRO,
      };
      expect(canUseCloudStorage(subscription)).toBe(true);
    });
  });

  describe('getSyncInterval', () => {
    it('should return free tier interval for null subscription', () => {
      expect(getSyncInterval(null)).toBe(30);
    });

    it('should return free tier interval for canceled subscription', () => {
      const subscription = {
        status: SUBSCRIPTION_STATUS.CANCELED,
        plan: SUBSCRIPTION_PLAN.PRO,
      };
      expect(getSyncInterval(subscription)).toBe(30);
    });

    it('should return pro tier interval for active pro subscription', () => {
      const subscription = {
        status: SUBSCRIPTION_STATUS.ACTIVE,
        plan: SUBSCRIPTION_PLAN.PRO,
      };
      expect(getSyncInterval(subscription)).toBe(5);
    });

    it('should return team tier interval for active team subscription', () => {
      const subscription = {
        status: SUBSCRIPTION_STATUS.ACTIVE,
        plan: SUBSCRIPTION_PLAN.TEAM,
      };
      expect(getSyncInterval(subscription)).toBe(1);
    });

    it('should return correct interval for trialing subscription', () => {
      const subscription = {
        status: SUBSCRIPTION_STATUS.TRIALING,
        plan: SUBSCRIPTION_PLAN.PRO,
      };
      expect(getSyncInterval(subscription)).toBe(5);
    });
  });

  describe('createUser', () => {
    it('should create a user with required fields', () => {
      const user = createUser({
        id: 'user-123',
        email: 'test@example.com',
      });

      expect(user.id).toBe('user-123');
      expect(user.email).toBe('test@example.com');
    });

    it('should set name if provided', () => {
      const user = createUser({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(user.name).toBe('Test User');
    });

    it('should set name to null if not provided', () => {
      const user = createUser({
        id: 'user-123',
        email: 'test@example.com',
      });

      expect(user.name).toBeNull();
    });

    it('should initialize avatarUrl as null', () => {
      const user = createUser({
        id: 'user-123',
        email: 'test@example.com',
      });

      expect(user.avatarUrl).toBeNull();
    });

    it('should initialize emailVerified as false', () => {
      const user = createUser({
        id: 'user-123',
        email: 'test@example.com',
      });

      expect(user.emailVerified).toBe(false);
    });

    it('should set createdAt to current timestamp', () => {
      const before = new Date().toISOString();
      const user = createUser({
        id: 'user-123',
        email: 'test@example.com',
      });
      const after = new Date().toISOString();

      expect(user.createdAt >= before).toBe(true);
      expect(user.createdAt <= after).toBe(true);
    });

    it('should set lastLoginAt to current timestamp', () => {
      const before = new Date().toISOString();
      const user = createUser({
        id: 'user-123',
        email: 'test@example.com',
      });
      const after = new Date().toISOString();

      expect(user.lastLoginAt >= before).toBe(true);
      expect(user.lastLoginAt <= after).toBe(true);
    });
  });
});
