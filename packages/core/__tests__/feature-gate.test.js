/**
 * @fileoverview Tests for feature gating infrastructure
 * Using Vitest (project's existing test framework)
 */

import { describe, it, expect } from 'vitest';
import {
  FEATURE_REQUIREMENTS,
  FREE_FEATURES,
  isSubscriptionActive,
  hasFeatureAccess,
  getFeaturesForPlan,
  getMinimumPlanForFeature,
  createFeatureGate,
  checkMultipleFeatures,
  getUpgradeSuggestions,
  VERSION_HISTORY_LIMITS,
  getVersionHistoryLimit,
  SYNC_INTERVAL_LIMITS,
  getSyncIntervalOptions,
  canUseScheduledSync,
  FEATURE_DISPLAY_NAMES,
  getFeatureDisplayName,
} from '../src/feature-gate.js';

describe('Feature Gate', () => {
  describe('isSubscriptionActive', () => {
    it('should return false for null subscription', () => {
      expect(isSubscriptionActive(null)).toBe(false);
    });

    it('should return false for undefined subscription', () => {
      expect(isSubscriptionActive(undefined)).toBe(false);
    });

    it('should return true for active subscription', () => {
      expect(isSubscriptionActive({ plan: 'pro', status: 'active' })).toBe(true);
    });

    it('should return true for trialing subscription', () => {
      expect(isSubscriptionActive({ plan: 'pro', status: 'trialing' })).toBe(true);
    });

    it('should return false for canceled subscription', () => {
      expect(isSubscriptionActive({ plan: 'pro', status: 'canceled' })).toBe(false);
    });

    it('should return false for past_due subscription', () => {
      expect(isSubscriptionActive({ plan: 'pro', status: 'past_due' })).toBe(false);
    });
  });

  describe('hasFeatureAccess', () => {
    const freeSubscription = { plan: 'free', status: 'active' };
    const proSubscription = { plan: 'pro', status: 'active' };
    const teamSubscription = { plan: 'team', status: 'active' };
    const canceledProSubscription = { plan: 'pro', status: 'canceled' };

    it('should allow free features for all users', () => {
      expect(hasFeatureAccess('basicSearch', null)).toBe(true);
      expect(hasFeatureAccess('basicSearch', freeSubscription)).toBe(true);
      expect(hasFeatureAccess('basicSearch', proSubscription)).toBe(true);
    });

    it('should deny Pro features for free users', () => {
      expect(hasFeatureAccess('tags', null)).toBe(false);
      expect(hasFeatureAccess('tags', freeSubscription)).toBe(false);
    });

    it('should allow Pro features for Pro users', () => {
      expect(hasFeatureAccess('tags', proSubscription)).toBe(true);
      expect(hasFeatureAccess('notes', proSubscription)).toBe(true);
      expect(hasFeatureAccess('smartSearch', proSubscription)).toBe(true);
      expect(hasFeatureAccess('duplicateDetection', proSubscription)).toBe(true);
      expect(hasFeatureAccess('brokenLinkChecker', proSubscription)).toBe(true);
      expect(hasFeatureAccess('analytics', proSubscription)).toBe(true);
      expect(hasFeatureAccess('scheduledSync', proSubscription)).toBe(true);
    });

    it('should allow Pro features for Team users', () => {
      expect(hasFeatureAccess('tags', teamSubscription)).toBe(true);
      expect(hasFeatureAccess('notes', teamSubscription)).toBe(true);
    });

    it('should deny Team-only features for Pro users', () => {
      expect(hasFeatureAccess('sharedFolders', proSubscription)).toBe(false);
      expect(hasFeatureAccess('teamManagement', proSubscription)).toBe(false);
      expect(hasFeatureAccess('sso', proSubscription)).toBe(false);
    });

    it('should allow Team-only features for Team users', () => {
      expect(hasFeatureAccess('sharedFolders', teamSubscription)).toBe(true);
      expect(hasFeatureAccess('teamManagement', teamSubscription)).toBe(true);
      expect(hasFeatureAccess('sso', teamSubscription)).toBe(true);
    });

    it('should deny Pro features for canceled subscriptions', () => {
      expect(hasFeatureAccess('tags', canceledProSubscription)).toBe(false);
    });

    it('should return true for unknown features (default to free)', () => {
      expect(hasFeatureAccess('unknownFeature', null)).toBe(true);
    });
  });

  describe('getFeaturesForPlan', () => {
    it('should return only free features for free plan', () => {
      const features = getFeaturesForPlan('free');
      expect(features).toEqual(FREE_FEATURES);
      expect(features).not.toContain('tags');
      expect(features).not.toContain('sharedFolders');
    });

    it('should return free + pro features for pro plan', () => {
      const features = getFeaturesForPlan('pro');
      expect(features).toContain('basicSearch'); // free feature
      expect(features).toContain('tags'); // pro feature
      expect(features).toContain('notes'); // pro feature
      expect(features).not.toContain('sharedFolders'); // team only
    });

    it('should return all features for team plan', () => {
      const features = getFeaturesForPlan('team');
      expect(features).toContain('basicSearch'); // free feature
      expect(features).toContain('tags'); // pro feature
      expect(features).toContain('sharedFolders'); // team feature
      expect(features).toContain('sso'); // team feature
    });
  });

  describe('getMinimumPlanForFeature', () => {
    it('should return free for free features', () => {
      expect(getMinimumPlanForFeature('basicSearch')).toBe('free');
      expect(getMinimumPlanForFeature('manualSync')).toBe('free');
    });

    it('should return pro for pro features', () => {
      expect(getMinimumPlanForFeature('tags')).toBe('pro');
      expect(getMinimumPlanForFeature('notes')).toBe('pro');
      expect(getMinimumPlanForFeature('smartSearch')).toBe('pro');
    });

    it('should return team for team-only features', () => {
      expect(getMinimumPlanForFeature('sharedFolders')).toBe('team');
      expect(getMinimumPlanForFeature('teamManagement')).toBe('team');
      expect(getMinimumPlanForFeature('sso')).toBe('team');
    });

    it('should return free for unknown features', () => {
      expect(getMinimumPlanForFeature('unknownFeature')).toBe('free');
    });
  });

  describe('createFeatureGate', () => {
    it('should create a function that checks features', () => {
      const proGate = createFeatureGate({ plan: 'pro', status: 'active' });
      expect(typeof proGate).toBe('function');
      expect(proGate('tags')).toBe(true);
      expect(proGate('sharedFolders')).toBe(false);
    });

    it('should work with null subscription', () => {
      const freeGate = createFeatureGate(null);
      expect(freeGate('basicSearch')).toBe(true);
      expect(freeGate('tags')).toBe(false);
    });
  });

  describe('checkMultipleFeatures', () => {
    it('should check multiple features at once', () => {
      const proSubscription = { plan: 'pro', status: 'active' };
      const result = checkMultipleFeatures(['tags', 'notes', 'sharedFolders'], proSubscription);

      expect(result).toEqual({
        tags: true,
        notes: true,
        sharedFolders: false,
      });
    });

    it('should work with free subscription', () => {
      const result = checkMultipleFeatures(['basicSearch', 'tags'], null);

      expect(result).toEqual({
        basicSearch: true,
        tags: false,
      });
    });
  });

  describe('getUpgradeSuggestions', () => {
    it('should suggest pro for pro features', () => {
      const suggestions = getUpgradeSuggestions(['tags', 'notes']);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].plan).toBe('pro');
      expect(suggestions[0].features).toContain('tags');
      expect(suggestions[0].features).toContain('notes');
    });

    it('should suggest team for team features', () => {
      const suggestions = getUpgradeSuggestions(['sharedFolders', 'sso']);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].plan).toBe('team');
      expect(suggestions[0].features).toContain('sharedFolders');
      expect(suggestions[0].features).toContain('sso');
    });

    it('should suggest both plans when mixed features', () => {
      const suggestions = getUpgradeSuggestions(['tags', 'sharedFolders']);
      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].plan).toBe('pro');
      expect(suggestions[1].plan).toBe('team');
    });

    it('should return empty array for free features', () => {
      const suggestions = getUpgradeSuggestions(['basicSearch']);
      expect(suggestions).toHaveLength(0);
    });
  });

  describe('Version History Limits', () => {
    it('should have correct limits for each plan', () => {
      expect(VERSION_HISTORY_LIMITS.free).toBe(5);
      expect(VERSION_HISTORY_LIMITS.pro).toBe(30);
      expect(VERSION_HISTORY_LIMITS.team).toBe(365);
    });

    it('should return correct limit via function', () => {
      expect(getVersionHistoryLimit('free')).toBe(5);
      expect(getVersionHistoryLimit('pro')).toBe(30);
      expect(getVersionHistoryLimit('team')).toBe(365);
    });

    it('should default to free limit for unknown plan', () => {
      expect(getVersionHistoryLimit('unknown')).toBe(5);
    });
  });

  describe('Sync Interval Limits', () => {
    it('should have no options for free plan', () => {
      expect(SYNC_INTERVAL_LIMITS.free.options).toHaveLength(0);
    });

    it('should have options for pro plan', () => {
      expect(SYNC_INTERVAL_LIMITS.pro.options.length).toBeGreaterThan(0);
      expect(SYNC_INTERVAL_LIMITS.pro.options).toContain(5);
      expect(SYNC_INTERVAL_LIMITS.pro.options).toContain(60);
    });

    it('should return correct options via function', () => {
      expect(getSyncIntervalOptions('free')).toHaveLength(0);
      expect(getSyncIntervalOptions('pro').length).toBeGreaterThan(0);
    });

    it('should correctly check scheduled sync availability', () => {
      expect(canUseScheduledSync('free')).toBe(false);
      expect(canUseScheduledSync('pro')).toBe(true);
      expect(canUseScheduledSync('team')).toBe(true);
    });
  });

  describe('Feature Display Names', () => {
    it('should have display names for all features', () => {
      expect(FEATURE_DISPLAY_NAMES.tags).toBe('Bookmark Tags');
      expect(FEATURE_DISPLAY_NAMES.notes).toBe('Bookmark Notes');
      expect(FEATURE_DISPLAY_NAMES.smartSearch).toBe('Smart Search');
    });

    it('should return display name via function', () => {
      expect(getFeatureDisplayName('tags')).toBe('Bookmark Tags');
      expect(getFeatureDisplayName('sharedFolders')).toBe('Shared Folders');
    });

    it('should return feature name for unknown features', () => {
      expect(getFeatureDisplayName('unknownFeature')).toBe('unknownFeature');
    });
  });

  describe('Feature Requirements', () => {
    it('should have tags as a pro feature', () => {
      expect(FEATURE_REQUIREMENTS.tags).toContain('pro');
      expect(FEATURE_REQUIREMENTS.tags).toContain('team');
    });

    it('should have sharedFolders as team-only', () => {
      expect(FEATURE_REQUIREMENTS.sharedFolders).toContain('team');
      expect(FEATURE_REQUIREMENTS.sharedFolders).not.toContain('pro');
    });

    it('should have all new pro features defined', () => {
      const proFeatures = [
        'tags',
        'notes',
        'smartSearch',
        'searchFilters',
        'duplicateDetection',
        'brokenLinkChecker',
        'analytics',
        'importAllFormats',
        'exportAllFormats',
        'scheduledSync',
      ];

      for (const feature of proFeatures) {
        expect(FEATURE_REQUIREMENTS[feature]).toBeDefined();
        expect(FEATURE_REQUIREMENTS[feature]).toContain('pro');
      }
    });
  });
});
