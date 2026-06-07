import { useMemo } from 'react';
import { getFlockConfig, getFlockClassType, getAnimalEmoji, getProductionFlags } from '../utils/animalClass';

export function useAnimalClass(flock) {
  return useMemo(() => {
    const classType = getFlockClassType(flock);
    const config    = getFlockConfig(flock);
    const flags     = getProductionFlags(flock);
    return { ...config, ...flags, classType, emoji: getAnimalEmoji(flock) };
  }, [flock]);
}
