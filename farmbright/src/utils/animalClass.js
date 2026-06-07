// ─────────────────────────────────────────────
// SPECIES MAP
// Preset species for the onboarding picker grid.
// Custom species are stored in Supabase with the
// same shape and read from there at runtime.
// ─────────────────────────────────────────────
export const SPECIES_MAP = {
  duck: {
    class_type:     'poultry',
    emoji:          '🦆',
    label:          'Ducks',
    produces_eggs:  true,
    produces_milk:  false,
    produces_meat:  true,
    produces_young: true,
    working_animal: false,
  },
  chicken: {
    class_type:     'poultry',
    emoji:          '🐓',
    label:          'Chickens',
    produces_eggs:  true,
    produces_milk:  false,
    produces_meat:  true,
    produces_young: true,
    working_animal: false,
  },
  turkey: {
    class_type:     'poultry',
    emoji:          '🦃',
    label:          'Turkeys',
    produces_eggs:  true,
    produces_milk:  false,
    produces_meat:  true,
    produces_young: true,
    working_animal: false,
  },
  quail: {
    class_type:     'poultry',
    emoji:          '🐦',
    label:          'Quail',
    produces_eggs:  true,
    produces_milk:  false,
    produces_meat:  true,
    produces_young: true,
    working_animal: false,
  },
  pig: {
    class_type:     'swine',
    emoji:          '🐖',
    label:          'Pigs',
    produces_eggs:  false,
    produces_milk:  false,
    produces_meat:  true,
    produces_young: true,
    working_animal: false,
  },
  goat: {
    class_type:     'goat',
    emoji:          '🐐',
    label:          'Goats',
    produces_eggs:  false,
    produces_milk:  true,
    produces_meat:  true,
    produces_young: true,
    working_animal: false,
  },
  cattle: {
    class_type:     'cattle',
    emoji:          '🐄',
    label:          'Cattle',
    produces_eggs:  false,
    produces_milk:  true,
    produces_meat:  true,
    produces_young: true,
    working_animal: false,
  },
  rabbit: {
    class_type:     'rabbit',
    emoji:          '🐇',
    label:          'Rabbits',
    produces_eggs:  false,
    produces_milk:  false,
    produces_meat:  true,
    produces_young: true,
    working_animal: false,
  },
  guardian: {
    class_type:     'guardian',
    emoji:          '🐕',
    label:          'Guardian / Working',
    produces_eggs:  false,
    produces_milk:  false,
    produces_meat:  false,
    produces_young: true,
    working_animal: true,
  },
  other: {
    class_type:     'other',
    emoji:          '🐾',
    label:          'Other / Custom',
    produces_eggs:  false,
    produces_milk:  false,
    produces_meat:  true,
    produces_young: true,
    working_animal: false,
  },
};

// ─────────────────────────────────────────────
// CLASS CONFIG
// Terminology and behavior per class_type.
// Production flags here are DEFAULTS for new
// species of this class type. The actual flags
// per animal class instance live in Supabase.
// ─────────────────────────────────────────────
export const CLASS_CONFIG = {
  poultry: {
    groupTerm:        'Flock',
    groupTermPlural:  'Flocks',
    headTerm:         'Birds',
    headTermSingular: 'Bird',
    youngTerm:        'Chicks',
    producesEggs:     true,
    producesMilk:     false,
    producesMeat:     true,
    producesYoung:    true,
    workingAnimal:    false,
    litterTracking:   false,
    designations: ['layer', 'breeder', 'meat', 'mixed'],
  },
  swine: {
    groupTerm:        'Herd',
    groupTermPlural:  'Herds',
    headTerm:         'Pigs',
    headTermSingular: 'Pig',
    youngTerm:        'Piglets',
    producesEggs:     false,
    producesMilk:     false,
    producesMeat:     true,
    producesYoung:    true,
    workingAnimal:    false,
    litterTracking:   true,
    designations: ['breeder', 'feeder', 'show', 'mixed'],
  },
  goat: {
    groupTerm:        'Herd',
    groupTermPlural:  'Herds',
    headTerm:         'Head',
    headTermSingular: 'Goat',
    youngTerm:        'Kids',
    producesEggs:     false,
    producesMilk:     true,
    producesMeat:     true,
    producesYoung:    true,
    workingAnimal:    false,
    litterTracking:   true,
    designations: ['dairy', 'meat', 'breeding', 'mixed'],
  },
  cattle: {
    groupTerm:        'Herd',
    groupTermPlural:  'Herds',
    headTerm:         'Head',
    headTermSingular: 'Head',
    youngTerm:        'Calves',
    producesEggs:     false,
    producesMilk:     true,
    producesMeat:     true,
    producesYoung:    true,
    workingAnimal:    false,
    litterTracking:   false,
    designations: ['dairy', 'beef', 'breeding', 'mixed'],
  },
  rabbit: {
    groupTerm:        'Colony',
    groupTermPlural:  'Colonies',
    headTerm:         'Rabbits',
    headTermSingular: 'Rabbit',
    youngTerm:        'Kits',
    producesEggs:     false,
    producesMilk:     false,
    producesMeat:     true,
    producesYoung:    true,
    workingAnimal:    false,
    litterTracking:   true,
    designations: ['breeder', 'meat', 'mixed'],
  },
  guardian: {
    groupTerm:        'Pack',
    groupTermPlural:  'Packs',
    headTerm:         'Dogs',
    headTermSingular: 'Dog',
    youngTerm:        'Pups',
    producesEggs:     false,
    producesMilk:     false,
    producesMeat:     false,
    producesYoung:    true,
    workingAnimal:    true,
    litterTracking:   true,
    designations: ['working', 'guardian', 'breeding', 'companion'],
  },
  other: {
    groupTerm:        'Group',
    groupTermPlural:  'Groups',
    headTerm:         'Animals',
    headTermSingular: 'Animal',
    youngTerm:        'Young',
    producesEggs:     false,
    producesMilk:     false,
    producesMeat:     true,
    producesYoung:    true,
    workingAnimal:    false,
    litterTracking:   false,
    designations: ['breeder', 'meat', 'working', 'mixed'],
  },
};

// ─────────────────────────────────────────────
// HELPERS — all existing exports preserved
// ─────────────────────────────────────────────

export function getClassConfig(classType) {
  return CLASS_CONFIG[classType] || CLASS_CONFIG.other;
}

// Handles both flat (flock.class_type) and
// nested (flock.breeds.animal_classes.class_type) shapes
export function getFlockClassType(flock) {
  return flock?.breeds?.animal_classes?.class_type
      || flock?.class_type
      || 'other';
}

export function getFlockConfig(flock) {
  return getClassConfig(getFlockClassType(flock));
}

// Reads emoji stored in animal_classes.emoji — no pattern matching
export function getAnimalEmoji(flock) {
  return flock?.breeds?.animal_classes?.emoji
      || flock?.emoji
      || '🐾';
}

export function formatGroupTerm(classType) {
  return getClassConfig(classType).groupTerm;
}

export function formatHeadcount(count, classType) {
  const cfg  = getClassConfig(classType);
  const term = count === 1 ? cfg.headTermSingular : cfg.headTerm;
  return `${count} ${term}`;
}

// ─────────────────────────────────────────────
// getProductionFlags
// Reads flags from the actual animal_class record
// (from Supabase) rather than CLASS_CONFIG defaults.
// Use this for conditional UI rendering.
// Falls back to CLASS_CONFIG if DB flags not present.
// Accepts either the nested animal_classes object
// (flock.breeds.animal_classes) or a flat flock
// object that has the flag fields at top level.
// ─────────────────────────────────────────────
export function getProductionFlags(animalClass) {
  if (!animalClass) {
    return {
      producesEggs:   false,
      producesMilk:   false,
      producesMeat:   true,
      producesYoung:  true,
      workingAnimal:  false,
      litterTracking: false,
    };
  }
  const classType = animalClass.class_type || 'other';
  const cfg = getClassConfig(classType);
  const eggs  = animalClass.produces_eggs   ?? cfg.producesEggs;
  const young = animalClass.produces_young  ?? cfg.producesYoung;
  return {
    producesEggs:   eggs,
    producesMilk:   animalClass.produces_milk   ?? cfg.producesMilk,
    producesMeat:   animalClass.produces_meat   ?? cfg.producesMeat,
    producesYoung:  young,
    workingAnimal:  animalClass.working_animal  ?? cfg.workingAnimal,
    litterTracking: young && !eggs,
  };
}

// ─────────────────────────────────────────────
// CUSTOM SPECIES BUILDER
// Builds the Supabase insert payload for a
// custom species created by the user.
// ─────────────────────────────────────────────
export function buildCustomSpeciesPayload(userId, {
  name,
  emoji          = '🐾',
  class_type     = 'other',
  produces_eggs  = false,
  produces_milk  = false,
  produces_meat  = true,
  produces_young = true,
  working_animal = false,
}) {
  return {
    user_id:        userId,
    name:           name.trim(),
    species:        'custom',
    emoji,
    class_type,
    produces_eggs,
    produces_milk,
    produces_meat,
    produces_young,
    working_animal,
    produces_fiber: false,
    produces_honey: false,
  };
}
