// Town Name Generator
// Names are generated based on town location and nearby features

import type { Town } from './towns';
import type { Center } from './types';
import { Random } from './random';

// ============================================
// NAME COMPONENT POOLS
// ============================================

// Generic prefixes - syllables that can start any name
const PREFIXES = [
  'Al', 'Ash', 'Bel', 'Black', 'Bran', 'Brier', 'Cal', 'Cedar', 'Clear',
  'Crag', 'Cross', 'Dark', 'Dawn', 'Dell', 'Dun', 'East', 'Elder', 'Elk',
  'Ever', 'Fair', 'Fall', 'Far', 'Fern', 'Glen', 'Gold', 'Gran', 'Gray',
  'Green', 'Hallow', 'Haver', 'Hawk', 'High', 'Hollow', 'Horn', 'Iron',
  'Ivy', 'Keld', 'King', 'Lake', 'Lark', 'Leaf', 'Long', 'Low', 'Lynn',
  'Maple', 'Marsh', 'Mead', 'Mill', 'Mist', 'Moon', 'Moss', 'New', 'Night',
  'North', 'Oak', 'Old', 'Pine', 'Raven', 'Red', 'River', 'Rock', 'Rose',
  'Salt', 'Sand', 'Shadow', 'Silver', 'South', 'Spring', 'Star', 'Still',
  'Stone', 'Storm', 'Summer', 'Sun', 'Swan', 'Thorn', 'Thunder', 'West',
  'White', 'Wild', 'Willow', 'Wind', 'Winter', 'Wolf', 'Wood',
];

// Generic suffixes - can end any name
const SUFFIXES = [
  'bury', 'by', 'crest', 'dale', 'den', 'fall', 'feld', 'field', 'ford',
  'gate', 'garde', 'glen', 'grove', 'ham', 'haven', 'helm', 'hill', 'hold',
  'hollow', 'holt', 'keep', 'lake', 'land', 'leigh', 'ley', 'loch', 'lyn',
  'march', 'mead', 'mere', 'mill', 'mont', 'moor', 'mouth', 'ness', 'point',
  'pool', 'rest', 'ridge', 'shire', 'side', 'stead', 'stone', 'thorpe',
  'ton', 'vale', 'view', 'ville', 'wall', 'ward', 'watch', 'water', 'way',
  'well', 'wick', 'wind', 'wood', 'worth', 'wrath',
];

// ============================================
// FEATURE-SPECIFIC COMPONENTS
// These give towns character based on location
// ============================================

// Shoreline/coastal town components
const SHORE_PREFIXES = [
  'Anchor', 'Bay', 'Beacon', 'Breaker', 'Brine', 'Cape', 'Cliff', 'Coral',
  'Cove', 'Drift', 'Gull', 'Harbor', 'Helm', 'Isle', 'Keel', 'Mast',
  'Pearl', 'Port', 'Reef', 'Sail', 'Salt', 'Sand', 'Sea', 'Shell', 'Ship',
  'Shore', 'Storm', 'Surf', 'Tide', 'Wave', 'Whale', 'Wind',
];

const SHORE_SUFFIXES = [
  'anchor', 'bay', 'beach', 'cape', 'cove', 'harbor', 'haven', 'helm',
  'hook', 'isle', 'landing', 'pier', 'point', 'port', 'quay', 'reef',
  'sail', 'sand', 'sea', 'shore', 'tide', 'watch', 'water', 'wharf',
];

// River town components
const RIVER_PREFIXES = [
  'Beck', 'Bridge', 'Brook', 'Creek', 'Current', 'Eddy', 'Falls', 'Ferry',
  'Fisher', 'Float', 'Flow', 'Ford', 'Mill', 'Otter', 'Pike', 'Pond',
  'Pool', 'Rapid', 'Reed', 'River', 'Rush', 'Salmon', 'Shallow', 'Spring',
  'Still', 'Stream', 'Swift', 'Trout', 'Wade', 'Water', 'Weir', 'Willow',
];

const RIVER_SUFFIXES = [
  'bank', 'beck', 'bridge', 'brook', 'creek', 'crossing', 'eddy', 'falls',
  'ferry', 'ford', 'mill', 'mouth', 'pool', 'rapids', 'run', 'shallows',
  'spring', 'stream', 'wade', 'water', 'weir',
];

// Mountain/highland town components
const MOUNTAIN_PREFIXES = [
  'Aerie', 'Crag', 'Crown', 'Eagle', 'Frost', 'Giant', 'Granite', 'Gray',
  'Height', 'High', 'Ice', 'Iron', 'King', 'Loft', 'Lone', 'North',
  'Peak', 'Pinnacle', 'Ram', 'Ridge', 'Rock', 'Rook', 'Sky', 'Slate',
  'Snow', 'Spur', 'Steep', 'Stone', 'Storm', 'Summit', 'Thunder', 'Tower',
  'Wind', 'Winter',
];

const MOUNTAIN_SUFFIXES = [
  'aerie', 'bluff', 'cairn', 'cliff', 'crag', 'crest', 'crown', 'fall',
  'frost', 'gate', 'guard', 'height', 'helm', 'hold', 'horn', 'keep',
  'mount', 'peak', 'perch', 'ridge', 'rock', 'spire', 'stone', 'summit',
  'top', 'tower', 'view', 'watch', 'wind',
];

// Inland/forest/plains town components
const INLAND_PREFIXES = [
  'Amber', 'Apple', 'Autumn', 'Barley', 'Berry', 'Briar', 'Broad', 'Copper',
  'Deer', 'Dust', 'Farm', 'Fawn', 'Field', 'Fox', 'Gold', 'Grain', 'Grass',
  'Green', 'Harvest', 'Hay', 'Hearth', 'Hedge', 'Herd', 'Honey', 'Meadow',
  'Oak', 'Oxen', 'Pasture', 'Plow', 'Prairie', 'Quiet', 'Rye', 'Shepherd',
  'Shire', 'Wheat', 'Wild', 'Wood',
];

const INLAND_SUFFIXES = [
  'acre', 'barn', 'borough', 'bury', 'dale', 'farm', 'field', 'fold',
  'garden', 'glade', 'green', 'grove', 'hamlet', 'hearth', 'hill', 'home',
  'hurst', 'land', 'lea', 'meadow', 'mill', 'plain', 'ranch', 'rest',
  'shade', 'shire', 'stead', 'thwaite', 'vale', 'village', 'wood',
];

// ============================================
// NAME PATTERNS
// Different structures for variety
// ============================================

type NamePattern =
  | 'prefix_suffix'      // Oakdale, Riverford
  | 'feature_generic'    // Harbor Town, Mountain View
  | 'the_place'          // The Crossing, The Heights
  | 'possessive'         // King's Landing, Fisher's Rest
  | 'descriptive'        // North Haven, Old Mill
  | 'compound';          // Blackwater Bay, Stormwind Keep

// Words for "The X" pattern
const THE_PLACES = [
  'Anchorage', 'Bluffs', 'Citadel', 'Cliffs', 'Crossing', 'Dell', 'Downs',
  'Falls', 'Fens', 'Ford', 'Forge', 'Garrison', 'Glen', 'Grove', 'Harbor',
  'Haven', 'Heights', 'Highlands', 'Holdfast', 'Hollows', 'Marches',
  'Meadows', 'Mill', 'Narrows', 'Oasis', 'Outpost', 'Pass', 'Pines',
  'Plains', 'Point', 'Pools', 'Reach', 'Refuge', 'Ridge', 'Shallows',
  'Shire', 'Shore', 'Springs', 'Strand', 'Summit', 'Tides', 'Vale',
  'Watch', 'Waters', 'Waypoint', 'Wilds', 'Woods',
];

// Possessive first parts
const POSSESSIVE_NAMES = [
  "Baker's", "Baron's", "Bishop's", "Brewer's", "Captain's", "Cooper's",
  "Dragon's", "Earl's", "Farmer's", "Fisher's", "Giant's", "Harper's",
  "Hunter's", "King's", "Knight's", "Lady's", "Lord's", "Maiden's",
  "Merchant's", "Miller's", "Miner's", "Queen's", "Raven's", "Sailor's",
  "Shepherd's", "Smith's", "Trader's", "Wanderer's", "Widow's", "Wolf's",
];

// Descriptive adjectives
const DESCRIPTIVES = [
  'Ancient', 'Bright', 'Broken', 'Dark', 'Dry', 'East', 'Far', 'First',
  'Free', 'Great', 'Hidden', 'High', 'Last', 'Little', 'Lone', 'Lost',
  'Low', 'Middle', 'New', 'North', 'Old', 'Outer', 'Silent', 'Small',
  'South', 'Twin', 'Upper', 'West', 'White', 'Young',
];

// ============================================
// NAME GENERATOR CLASS
// ============================================

export class TownNameGenerator {
  private random: Random;
  private usedNames: Set<string> = new Set();

  constructor(seed: number) {
    this.random = new Random(seed);
  }

  // Generate a name for a town based on its type and features
  generateName(town: Town): string {
    let name: string;
    let attempts = 0;
    const maxAttempts = 20;

    // Try to generate a unique name
    do {
      name = this.createName(town);
      attempts++;
    } while (this.usedNames.has(name) && attempts < maxAttempts);

    // If we couldn't find a unique name, add a number
    if (this.usedNames.has(name)) {
      let num = 2;
      while (this.usedNames.has(`${name} ${num}`)) {
        num++;
      }
      name = `${name} ${num}`;
    }

    this.usedNames.add(name);
    return name;
  }

  private createName(town: Town): string {
    // Choose pattern based on random chance
    // Feature-based names are more likely (60% chance)
    const useFeatureName = this.random.next() < 0.6;

    if (useFeatureName) {
      return this.createFeatureBasedName(town);
    } else {
      return this.createGenericName(town);
    }
  }

  private createFeatureBasedName(town: Town): string {
    const pattern = this.selectPattern();

    switch (pattern) {
      case 'prefix_suffix':
        return this.patternPrefixSuffix(town);
      case 'feature_generic':
        return this.patternFeatureGeneric(town);
      case 'the_place':
        return this.patternThePlace(town);
      case 'possessive':
        return this.patternPossessive(town);
      case 'descriptive':
        return this.patternDescriptive(town);
      case 'compound':
        return this.patternCompound(town);
      default:
        return this.patternPrefixSuffix(town);
    }
  }

  private createGenericName(town: Town): string {
    // Pure prefix + suffix, no feature influence
    const prefix = this.pick(PREFIXES);
    const suffix = this.pick(SUFFIXES);
    return prefix + suffix;
  }

  private selectPattern(): NamePattern {
    const roll = this.random.next();
    if (roll < 0.35) return 'prefix_suffix';      // Most common
    if (roll < 0.50) return 'descriptive';
    if (roll < 0.65) return 'possessive';
    if (roll < 0.80) return 'compound';
    if (roll < 0.90) return 'the_place';
    return 'feature_generic';
  }

  // Pattern: FeaturePrefix + FeatureSuffix (e.g., "Harborview", "Riverford")
  private patternPrefixSuffix(town: Town): string {
    const { prefixes, suffixes } = this.getFeaturePools(town.type);

    // Mix feature-specific with generic for variety
    const useFeaturePrefix = this.random.next() < 0.7;
    const useFeatureSuffix = this.random.next() < 0.7;

    const prefix = useFeaturePrefix ? this.pick(prefixes) : this.pick(PREFIXES);
    const suffix = useFeatureSuffix ? this.pick(suffixes) : this.pick(SUFFIXES);

    return prefix + suffix;
  }

  // Pattern: Feature + Generic word (e.g., "Harbor Town", "Mountain Gate")
  private patternFeatureGeneric(town: Town): string {
    const { prefixes } = this.getFeaturePools(town.type);
    const prefix = this.pick(prefixes);
    const generic = this.pick(['Town', 'City', 'Gate', 'Point', 'View', 'End', 'Base', 'Post']);
    return `${prefix} ${generic}`;
  }

  // Pattern: The + Place (e.g., "The Crossing", "The Heights")
  private patternThePlace(town: Town): string {
    // Sometimes use feature-appropriate places
    const { suffixes } = this.getFeaturePools(town.type);
    const useFeature = this.random.next() < 0.5;

    if (useFeature && suffixes.length > 0) {
      const place = this.pick(suffixes);
      // Capitalize and sometimes pluralize
      const capitalized = place.charAt(0).toUpperCase() + place.slice(1);
      return `The ${capitalized}`;
    }

    return `The ${this.pick(THE_PLACES)}`;
  }

  // Pattern: Name's + Place (e.g., "Fisher's Rest", "King's Landing")
  private patternPossessive(town: Town): string {
    const possessive = this.pick(POSSESSIVE_NAMES);
    const { suffixes } = this.getFeaturePools(town.type);

    // Mix feature suffixes with generic
    const useFeature = this.random.next() < 0.5;
    let place: string;

    if (useFeature && suffixes.length > 0) {
      place = this.pick(suffixes);
      place = place.charAt(0).toUpperCase() + place.slice(1);
    } else {
      place = this.pick(['Rest', 'Landing', 'Crossing', 'Watch', 'Hold', 'Keep', 'Point', 'Haven', 'Reach', 'End']);
    }

    return `${possessive} ${place}`;
  }

  // Pattern: Adjective + Feature (e.g., "North Harbor", "Old Mill")
  private patternDescriptive(town: Town): string {
    const adjective = this.pick(DESCRIPTIVES);
    const { prefixes, suffixes } = this.getFeaturePools(town.type);

    // Use either a prefix or suffix as the noun
    const usePrefix = this.random.next() < 0.5;
    let noun: string;

    if (usePrefix) {
      noun = this.pick(prefixes);
    } else {
      noun = this.pick(suffixes);
      noun = noun.charAt(0).toUpperCase() + noun.slice(1);
    }

    return `${adjective} ${noun}`;
  }

  // Pattern: Prefix + Suffix + Feature (e.g., "Blackwater Bay", "Stormwind Keep")
  private patternCompound(town: Town): string {
    const prefix = this.pick(PREFIXES);
    const { prefixes: featurePrefixes } = this.getFeaturePools(town.type);

    // Create a compound first word
    const middle = this.pick(featurePrefixes).toLowerCase();
    const suffix = this.pick(['Bay', 'Keep', 'Hold', 'Port', 'Falls', 'Gate', 'Watch', 'Reach', 'Point', 'Cove']);

    return `${prefix}${middle} ${suffix}`;
  }

  // Get feature-appropriate word pools based on town type
  private getFeaturePools(type: string): { prefixes: string[]; suffixes: string[] } {
    switch (type) {
      case 'shoreline':
        return { prefixes: SHORE_PREFIXES, suffixes: SHORE_SUFFIXES };
      case 'river':
        return { prefixes: RIVER_PREFIXES, suffixes: RIVER_SUFFIXES };
      case 'elevation':
        return { prefixes: MOUNTAIN_PREFIXES, suffixes: MOUNTAIN_SUFFIXES };
      case 'inland':
      default:
        return { prefixes: INLAND_PREFIXES, suffixes: INLAND_SUFFIXES };
    }
  }

  // Pick a random element from an array
  private pick<T>(arr: T[]): T {
    return arr[this.random.int(0, arr.length - 1)];
  }

  // Reset used names (for regeneration)
  reset(): void {
    this.usedNames.clear();
  }
}

// Convenience function to generate names for all towns
export function generateTownNames(towns: Town[], seed: number): Map<number, string> {
  const generator = new TownNameGenerator(seed);
  const names = new Map<number, string>();

  for (const town of towns) {
    names.set(town.id, generator.generateName(town));
  }

  return names;
}
