import { useMemo } from 'react';
import { getFlockConfig, getFlockClassType, getAnimalEmoji, getProductionFlags } from '../utils/animalClass';

export function useAnimalClass(flock) {
  return useMemo(() => {
    const classType = getFlockClassType(flock);
    const config    = getFlockConfig(flock);
    // Reads production flags from DB (flock.breeds.animal_classes) with
    // CLASS_CONFIG fallback for flat flock objects that lack the nested structure.
    const flags     = getProductionFlags(flock?.breeds?.animal_classes ?? flock);
    return { ...config, ...flags, classType, emoji: getAnimalEmoji(flock) };
  }, [flock]);
}
