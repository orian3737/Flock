export const CLASS_CONFIG = {
  poultry: {
    groupTerm:        'Flock',
    groupTermPlural:  'Flocks',
    headTerm:         'Birds',
    headTermSingular: 'Bird',
    youngTerm:        'Chicks',
    emoji:            '🐓',
    producesEggs:     true,
    producesMilk:     false,
    producesYoung:    true,
    meatSaleUnit:     'per_bird',
    litterTracking:   false,
    designations: ['layer', 'breeder', 'meat', 'mixed'],
  },
  swine: {
    groupTerm:        'Herd',
    groupTermPlural:  'Herds',
    headTerm:         'Pigs',
    headTermSingular: 'Pig',
    youngTerm:        'Piglets',
    emoji:            '🐖',
    producesEggs:     false,
    producesMilk:     false,
    producesYoung:    true,
    meatSaleUnit:     'per_lb',
    litterTracking:   true,
    designations: ['breeder', 'feeder', 'show', 'mixed'],
  },
  goat: {
    groupTerm:        'Herd',
    groupTermPlural:  'Herds',
    headTerm:         'Head',
    headTermSingular: 'Goat',
    youngTerm:        'Kids',
    emoji:            '🐐',
    producesEggs:     false,
    producesMilk:     true,
    producesYoung:    true,
    meatSaleUnit:     'per_lb',
    litterTracking:   true,
    designations: ['dairy', 'meat', 'breeding', 'mixed'],
  },
  cattle: {
    groupTerm:        'Herd',
    groupTermPlural:  'Herds',
    headTerm:         'Head',
    headTermSingular: 'Head',
    youngTerm:        'Calves',
    emoji:            '🐄',
    producesEggs:     false,
    producesMilk:     true,
    producesYoung:    true,
    meatSaleUnit:     'per_lb',
    litterTracking:   false,
    designations: ['dairy', 'beef', 'breeding', 'mixed'],
  },
  rabbit: {
    groupTerm:        'Colony',
    groupTermPlural:  'Colonies',
    headTerm:         'Rabbits',
    headTermSingular: 'Rabbit',
    youngTerm:        'Kits',
    emoji:            '🐇',
    producesEggs:     false,
    producesMilk:     false,
    producesYoung:    true,
    meatSaleUnit:     'per_bird',
    litterTracking:   true,
    designations: ['breeder', 'meat', 'mixed'],
  },
  other: {
    groupTerm:        'Group',
    groupTermPlural:  'Groups',
    headTerm:         'Animals',
    headTermSingular: 'Animal',
    youngTerm:        'Young',
    emoji:            '🐾',
    producesEggs:     false,
    producesMilk:     false,
    producesYoung:    false,
    meatSaleUnit:     'per_bird',
    litterTracking:   false,
    designations: ['breeder', 'meat', 'mixed'],
  },
};

export function getClassConfig(classType) {
  return CLASS_CONFIG[classType] || CLASS_CONFIG.other;
}

// Handles both flat (flock.class_type) and
// nested (flock.breeds.animal_classes.class_type) shapes
export function getFlockClassType(flock) {
  return flock?.breeds?.animal_classes?.class_type
      || flock?.class_type
      || 'poultry';
}

export function getFlockConfig(flock) {
  return getClassConfig(getFlockClassType(flock));
}

// Dynamic emoji — checks class_type first, then name for poultry sub-types
export function getAnimalEmoji(classType, name = '') {
  if (classType && CLASS_CONFIG[classType]) {
    const lower = name.toLowerCase();
    if (classType === 'poultry') {
      if (lower.includes('duck'))        return '🦆';
      if (lower.includes('muscovy'))     return '🦆';
      if (lower.includes('appleyard'))   return '🦆';
      if (lower.includes('saxony'))      return '🦆';
      if (lower.includes('silver'))      return '🦆';
      if (lower.includes('turkey'))      return '🦃';
      if (lower.includes('bourbon'))     return '🦃';
      if (lower.includes('chocolate'))   return '🦃';
      if (lower.includes('quail'))       return '🐦';
      if (lower.includes('bobwhite'))    return '🐦';
      if (lower.includes('egyptian'))    return '🐦';
      if (lower.includes('jumbo'))       return '🐦';
      if (lower.includes('chicken'))     return '🐓';
      return '🐓';
    }
    return CLASS_CONFIG[classType].emoji;
  }
  const lower = name.toLowerCase();
  if (lower.includes('duck'))                           return '🦆';
  if (lower.includes('turkey'))                         return '🦃';
  if (lower.includes('quail'))                          return '🐦';
  if (lower.includes('chicken'))                        return '🐓';
  if (lower.includes('pig') || lower.includes('ossabaw')) return '🐖';
  if (lower.includes('goat'))                           return '🐐';
  if (lower.includes('cattle') || lower.includes('cow')) return '🐄';
  if (lower.includes('rabbit'))                         return '🐇';
  return '🐾';
}

export function formatHeadcount(count, classType) {
  const cfg = getClassConfig(classType);
  const term = count === 1 ? cfg.headTermSingular : cfg.headTerm;
  return `${count} ${term}`;
}

export function formatGroupTerm(classType) {
  return getClassConfig(classType).groupTerm;
}
