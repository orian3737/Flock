import { useMemo } from 'react';
import { getFlockConfig, getFlockClassType, getAnimalEmoji } from '../utils/animalClass';

// Pass a flock object (with breeds.animal_classes.class_type or flat class_type).
// Returns all config values plus computed helpers.
export function useAnimalClass(flock) {
  return useMemo(() => {
    const classType = getFlockClassType(flock);
    const config    = getFlockConfig(flock);
    const breedName = flock?.breeds?.name || flock?.breed_name || '';
    return {
      ...config,
      classType,
      emoji: getAnimalEmoji(classType, breedName),
    };
  }, [flock]);
}
