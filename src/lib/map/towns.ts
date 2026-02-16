// Town/Location Generator
// Flexible framework for placing settlements based on terrain rules

import type { Center, Edge } from './types';
import type { MapData } from './generator';
import { Random } from './random';
import { TownNameGenerator } from './townNames';

// Configuration for town placement rules
export interface TownPlacementRule {
  type: 'shoreline' | 'river' | 'elevation' | 'inland';
  // Percentage of total towns that should match this rule (0-1)
  targetPercent: number;
  // Minimum guaranteed placements for this rule
  minCount: number;
  // Maximum placements for this rule (0 = unlimited up to targetPercent)
  maxCount: number;
  // For elevation rules: the elevation band
  elevationMin?: number;
  elevationMax?: number;
  // Priority when resolving conflicts (higher = placed first)
  priority: number;
}

export interface TownConfig {
  // Total number of towns to generate
  totalTowns: number;
  // Minimum distance between towns (in map units)
  minDistance: number;
  // Placement rules
  rules: TownPlacementRule[];
  // Random seed (uses map seed if not provided)
  seed?: number;
}

export type TownSize = 'large' | 'medium' | 'small';

export interface Town {
  id: number;
  center: Center;
  type: 'shoreline' | 'river' | 'elevation' | 'inland';
  elevation: number;
  // Which rule placed this town
  rule: TownPlacementRule;
  // Position for rendering
  x: number;
  y: number;
  // Generated name
  name: string;
  // Town size affects icon rendering
  size: TownSize;
}

export interface TownGeneratorResult {
  towns: Town[];
  // Statistics about placement
  stats: {
    total: number;
    byType: Record<string, number>;
    rulesFullfilled: boolean;
  };
}

// Default configuration
export const DEFAULT_TOWN_CONFIG: TownConfig = {
  totalTowns: 15,
  minDistance: 40,
  rules: [
    {
      type: 'shoreline',
      targetPercent: 0.3,
      minCount: 2,
      maxCount: 0,
      priority: 10,
    },
    {
      type: 'river',
      targetPercent: 0.25,
      minCount: 2,
      maxCount: 0,
      priority: 8,
    },
    {
      type: 'elevation',
      targetPercent: 0.15,
      minCount: 1,
      maxCount: 3,
      elevationMin: 0.6,
      elevationMax: 1.0,
      priority: 6,
    },
    {
      type: 'elevation',
      targetPercent: 0.2,
      minCount: 1,
      maxCount: 0,
      elevationMin: 0.3,
      elevationMax: 0.6,
      priority: 4,
    },
    {
      type: 'inland',
      targetPercent: 0.1,
      minCount: 0,
      maxCount: 0,
      priority: 2,
    },
  ],
};

export class TownGenerator {
  private mapData: MapData;
  private random: Random;
  private config: TownConfig;
  private nameGenerator: TownNameGenerator;

  // Cached valid locations by type
  private shorelineCenters: Center[] = [];
  private riverCenters: Center[] = [];
  private landCenters: Center[] = [];

  constructor(mapData: MapData, config: Partial<TownConfig> = {}) {
    this.mapData = mapData;
    this.config = { ...DEFAULT_TOWN_CONFIG, ...config };
    const seed = this.config.seed ?? mapData.config.seed;
    this.random = new Random(seed);
    this.nameGenerator = new TownNameGenerator(seed);

    this.cacheValidLocations();
  }

  private cacheValidLocations(): void {
    // Find all land centers (not water)
    this.landCenters = this.mapData.centers.filter(c => !c.water && !c.ocean);

    // Find shoreline centers (land adjacent to ocean)
    this.shorelineCenters = this.landCenters.filter(c => c.coast);

    // Find river centers (land with river edges)
    const riverCenterSet = new Set<Center>();
    for (const edge of this.mapData.edges) {
      if (edge.river > 0) {
        if (edge.d0 && !edge.d0.water) riverCenterSet.add(edge.d0);
        if (edge.d1 && !edge.d1.water) riverCenterSet.add(edge.d1);
      }
    }
    this.riverCenters = Array.from(riverCenterSet);
  }

  generate(): TownGeneratorResult {
    const towns: Town[] = [];
    const placedCenters = new Set<Center>();
    const stats = {
      total: 0,
      byType: {} as Record<string, number>,
      rulesFullfilled: true,
    };

    // Sort rules by priority (highest first)
    const sortedRules = [...this.config.rules].sort((a, b) => b.priority - a.priority);

    // First pass: fulfill minimum counts for each rule
    for (const rule of sortedRules) {
      const minNeeded = rule.minCount;
      let placed = 0;

      while (placed < minNeeded && towns.length < this.config.totalTowns) {
        const center = this.findValidCenter(rule, placedCenters);
        if (!center) {
          stats.rulesFullfilled = false;
          break;
        }

        const town = this.createTown(towns.length, center, rule);
        towns.push(town);
        placedCenters.add(center);
        placed++;

        stats.byType[rule.type] = (stats.byType[rule.type] || 0) + 1;
      }
    }

    // Second pass: fill remaining slots based on target percentages
    while (towns.length < this.config.totalTowns) {
      // Calculate which rule should get the next town based on current distribution
      const rule = this.selectRuleByTarget(towns, sortedRules);
      if (!rule) break;

      const center = this.findValidCenter(rule, placedCenters);
      if (!center) {
        // Try another rule if this one has no valid spots
        const fallbackRule = this.findFallbackRule(sortedRules, placedCenters);
        if (!fallbackRule) break;

        const fallbackCenter = this.findValidCenter(fallbackRule, placedCenters);
        if (!fallbackCenter) break;

        const town = this.createTown(towns.length, fallbackCenter, fallbackRule);
        towns.push(town);
        placedCenters.add(fallbackCenter);
        stats.byType[fallbackRule.type] = (stats.byType[fallbackRule.type] || 0) + 1;
      } else {
        const town = this.createTown(towns.length, center, rule);
        towns.push(town);
        placedCenters.add(center);
        stats.byType[rule.type] = (stats.byType[rule.type] || 0) + 1;
      }
    }

    stats.total = towns.length;

    return { towns, stats };
  }

  private selectRuleByTarget(
    currentTowns: Town[],
    rules: TownPlacementRule[]
  ): TownPlacementRule | null {
    const totalTarget = this.config.totalTowns;

    // Find the rule that's most under-represented relative to its target
    let bestRule: TownPlacementRule | null = null;
    let bestDeficit = -Infinity;

    for (const rule of rules) {
      // Check max count
      const currentCount = currentTowns.filter(t => t.rule === rule).length;
      if (rule.maxCount > 0 && currentCount >= rule.maxCount) continue;

      const targetCount = Math.floor(rule.targetPercent * totalTarget);
      const deficit = targetCount - currentCount;

      if (deficit > bestDeficit) {
        bestDeficit = deficit;
        bestRule = rule;
      }
    }

    // If all rules are at or above target, pick randomly weighted by remaining capacity
    if (bestDeficit <= 0) {
      const availableRules = rules.filter(r => {
        const count = currentTowns.filter(t => t.rule === r).length;
        return r.maxCount === 0 || count < r.maxCount;
      });

      if (availableRules.length === 0) return null;
      return availableRules[this.random.int(0, availableRules.length - 1)];
    }

    return bestRule;
  }

  private findFallbackRule(
    rules: TownPlacementRule[],
    placedCenters: Set<Center>
  ): TownPlacementRule | null {
    // Try each rule in priority order to find one with valid locations
    for (const rule of rules) {
      const candidates = this.getCandidatesForRule(rule);
      const valid = candidates.filter(c => this.isValidPlacement(c, placedCenters));
      if (valid.length > 0) return rule;
    }
    return null;
  }

  private findValidCenter(
    rule: TownPlacementRule,
    placedCenters: Set<Center>
  ): Center | null {
    const candidates = this.getCandidatesForRule(rule);

    // Filter by minimum distance from existing towns
    const valid = candidates.filter(c => this.isValidPlacement(c, placedCenters));

    if (valid.length === 0) return null;

    // Shuffle and pick one
    this.random.shuffle(valid);
    return valid[0];
  }

  private getCandidatesForRule(rule: TownPlacementRule): Center[] {
    switch (rule.type) {
      case 'shoreline':
        return this.shorelineCenters;

      case 'river':
        // River centers that aren't on the shoreline (to differentiate)
        return this.riverCenters.filter(c => !c.coast);

      case 'elevation':
        const minElev = rule.elevationMin ?? 0;
        const maxElev = rule.elevationMax ?? 1;
        return this.landCenters.filter(
          c => c.elevation >= minElev && c.elevation <= maxElev && !c.coast
        );

      case 'inland':
        // Inland: not coast, not river-adjacent
        const riverSet = new Set(this.riverCenters);
        return this.landCenters.filter(c => !c.coast && !riverSet.has(c));

      default:
        return this.landCenters;
    }
  }

  private isValidPlacement(center: Center, placedCenters: Set<Center>): boolean {
    if (placedCenters.has(center)) return false;

    // Check minimum distance from all placed towns
    for (const placed of placedCenters) {
      const dx = center.point.x - placed.point.x;
      const dy = center.point.y - placed.point.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < this.config.minDistance) {
        return false;
      }
    }

    return true;
  }

  private createTown(id: number, center: Center, rule: TownPlacementRule): Town {
    const size = this.determineTownSize(rule.type);

    const town: Town = {
      id,
      center,
      type: rule.type,
      elevation: center.elevation,
      rule,
      x: center.point.x,
      y: center.point.y,
      name: '', // Will be set below
      size,
    };

    // Generate name based on town type and features
    town.name = this.nameGenerator.generateName(town);

    return town;
  }

  private determineTownSize(type: TownPlacementRule['type']): TownSize {
    const roll = this.random.next();

    // Size distribution varies by town type
    switch (type) {
      case 'shoreline':
        // Coastal towns: more likely to be large (ports, trade hubs)
        if (roll < 0.35) return 'large';
        if (roll < 0.75) return 'medium';
        return 'small';

      case 'river':
        // River towns: mostly medium (trade stops)
        if (roll < 0.2) return 'large';
        if (roll < 0.7) return 'medium';
        return 'small';

      case 'elevation':
        // Mountain towns: mostly small (outposts, keeps)
        if (roll < 0.15) return 'large';
        if (roll < 0.45) return 'medium';
        return 'small';

      case 'inland':
      default:
        // Inland towns: villages and hamlets
        if (roll < 0.1) return 'large';
        if (roll < 0.45) return 'medium';
        return 'small';
    }
  }
}

// Helper to create a custom config
export function createTownConfig(overrides: Partial<TownConfig>): TownConfig {
  return { ...DEFAULT_TOWN_CONFIG, ...overrides };
}

// Helper to create elevation band rules
export function createElevationRule(
  min: number,
  max: number,
  targetPercent: number,
  minCount: number = 0,
  priority: number = 5
): TownPlacementRule {
  return {
    type: 'elevation',
    targetPercent,
    minCount,
    maxCount: 0,
    elevationMin: min,
    elevationMax: max,
    priority,
  };
}
