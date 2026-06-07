export const SPECIES_MAP = {
  duck:     { class_type:'poultry',  emoji:'🦆', label:'Ducks',
              produces_eggs:true,  produces_milk:false, produces_meat:true,  produces_young:true,  working_animal:false },
  chicken:  { class_type:'poultry',  emoji:'🐓', label:'Chickens',
              produces_eggs:true,  produces_milk:false, produces_meat:true,  produces_young:true,  working_animal:false },
  turkey:   { class_type:'poultry',  emoji:'🦃', label:'Turkeys',
              produces_eggs:true,  produces_milk:false, produces_meat:true,  produces_young:true,  working_animal:false },
  quail:    { class_type:'poultry',  emoji:'🐦', label:'Quail',
              produces_eggs:true,  produces_milk:false, produces_meat:true,  produces_young:true,  working_animal:false },
  pig:      { class_type:'swine',    emoji:'🐖', label:'Pigs',
              produces_eggs:false, produces_milk:false, produces_meat:true,  produces_young:true,  working_animal:false },
  goat:     { class_type:'goat',     emoji:'🐐', label:'Goats',
              produces_eggs:false, produces_milk:true,  produces_meat:true,  produces_young:true,  working_animal:false },
  cattle:   { class_type:'cattle',   emoji:'🐄', label:'Cattle',
              produces_eggs:false, produces_milk:true,  produces_meat:true,  produces_young:true,  working_animal:false },
  rabbit:   { class_type:'rabbit',   emoji:'🐇', label:'Rabbits',
              produces_eggs:false, produces_milk:false, produces_meat:true,  produces_young:true,  working_animal:false },
  guardian: { class_type:'guardian', emoji:'🐕', label:'Guardian / Working',
              produces_eggs:false, produces_milk:false, produces_meat:false, produces_young:true,  working_animal:true  },
  other:    { class_type:'other',    emoji:'🐾', label:'Other / Custom',
              produces_eggs:false, produces_milk:false, produces_meat:true,  produces_young:true,  working_animal:false },
};

export const CLASS_CONFIG = {
  poultry:  { groupTerm:'Flock',  groupTermPlural:'Flocks',
              headTerm:'Birds',   headTermSingular:'Bird',
              youngTerm:'Chicks', litterTracking:false,
              designations:['layer','breeder','meat','mixed'] },
  swine:    { groupTerm:'Herd',   groupTermPlural:'Herds',
              headTerm:'Pigs',    headTermSingular:'Pig',
              youngTerm:'Piglets',litterTracking:true,
              designations:['breeder','feeder','show','mixed'] },
  goat:     { groupTerm:'Herd',   groupTermPlural:'Herds',
              headTerm:'Head',    headTermSingular:'Goat',
              youngTerm:'Kids',   litterTracking:true,
              designations:['dairy','meat','breeding','mixed'] },
  cattle:   { groupTerm:'Herd',   groupTermPlural:'Herds',
              headTerm:'Head',    headTermSingular:'Head',
              youngTerm:'Calves', litterTracking:false,
              designations:['dairy','beef','breeding','mixed'] },
  rabbit:   { groupTerm:'Colony', groupTermPlural:'Colonies',
              headTerm:'Rabbits', headTermSingular:'Rabbit',
              youngTerm:'Kits',   litterTracking:true,
              designations:['breeder','meat','mixed'] },
  guardian: { groupTerm:'Pack',   groupTermPlural:'Packs',
              headTerm:'Dogs',    headTermSingular:'Dog',
              youngTerm:'Pups',   litterTracking:true,
              designations:['working','guardian','breeding','companion'] },
  other:    { groupTerm:'Group',  groupTermPlural:'Groups',
              headTerm:'Animals', headTermSingular:'Animal',
              youngTerm:'Young',  litterTracking:false,
              designations:['breeder','meat','working','mixed'] },
};

export function getClassConfig(classType) {
  return CLASS_CONFIG[classType] || CLASS_CONFIG.other;
}

// New join path: breeds.animal_types.animal_classes.class_type
// Flat fallback: flock.class_type
export function getFlockClassType(flock) {
  return flock?.breeds?.animal_types?.animal_classes?.class_type
      || flock?.breeds?.animal_classes?.class_type
      || flock?.class_type
      || 'other';
}

export function getFlockConfig(flock) {
  return getClassConfig(getFlockClassType(flock));
}

// Reads emoji from animal_types.emoji (new path)
// Falls back to flat flock.emoji for service-layer mappings
export function getAnimalEmoji(flock) {
  return flock?.breeds?.animal_types?.emoji
      || flock?.breeds?.animal_classes?.emoji
      || flock?.emoji
      || '🐾';
}

// Production flags live on animal_types in the new schema.
// Accepts a flock object (nested or flat) or an animal_type object directly.
export function getProductionFlags(flock) {
  const at = flock?.breeds?.animal_types;
  const eggs  = at?.produces_eggs  ?? flock?.produces_eggs  ?? false;
  const young = at?.produces_young ?? flock?.produces_young ?? true;
  return {
    producesEggs:   eggs,
    producesMilk:   at?.produces_milk  ?? flock?.produces_milk  ?? false,
    producesMeat:   at?.produces_meat  ?? flock?.produces_meat  ?? true,
    producesYoung:  young,
    workingAnimal:  at?.working_animal ?? flock?.working_animal ?? false,
    litterTracking: young && !eggs,
  };
}

export function formatGroupTerm(classType) {
  return getClassConfig(classType).groupTerm;
}

export function formatHeadcount(count, classType) {
  const cfg  = getClassConfig(classType);
  const term = count === 1 ? cfg.headTermSingular : cfg.headTerm;
  return `${count} ${term}`;
}

// Returns insert payload for animal_types table (not animal_classes).
export function buildAnimalTypePayload(animalClassId, {
  name,
  species        = 'custom',
  emoji          = '🐾',
  produces_eggs  = false,
  produces_milk  = false,
  produces_meat  = true,
  produces_young = true,
  working_animal = false,
}) {
  return {
    animal_class_id: animalClassId,
    name:            name.trim(),
    species,
    emoji,
    produces_eggs,
    produces_milk,
    produces_meat,
    produces_young,
    working_animal,
    produces_fiber: false,
    produces_honey: false,
  };
}

// Legacy alias — keep for any callers not yet updated
export { buildAnimalTypePayload as buildCustomSpeciesPayload };
