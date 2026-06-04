import { createContext, useContext, useState } from "react";

const FarmContext = createContext(null);

export function FarmProvider({ children }) {
  const [farm, setFarm] = useState(null);

  return (
    <FarmContext.Provider value={{ farm, setFarm }}>
      {children}
    </FarmContext.Provider>
  );
}

export function useFarm() {
  return useContext(FarmContext);
}
