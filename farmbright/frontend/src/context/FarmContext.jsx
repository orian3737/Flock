import React, { createContext, useContext, useEffect, useState } from "react";

import { AuthContext } from "./AuthContext";

export const FarmContext = createContext(null);

export function FarmProvider({ children }) {
  const { dbUser } = useContext(AuthContext);
  const [farmName, setFarmNameState] = useState(() => localStorage.getItem("Flock_farm_name") || "");
  const [userId, setUserIdState] = useState(() => {
    const storedUserId = localStorage.getItem("Flock_user_id");
    return storedUserId ? Number(storedUserId) : null;
  });

  useEffect(() => {
    const nextFarmName = dbUser?.farm_name || localStorage.getItem("Flock_farm_name") || "";
    const storedUserId = localStorage.getItem("Flock_user_id");
    const nextUserId = dbUser?.id || (storedUserId ? Number(storedUserId) : null);

    setFarmNameState(nextFarmName);
    setUserIdState(nextUserId);
  }, [dbUser]);

  function setFarmName(nextFarmName) {
    setFarmNameState(nextFarmName);
    if (nextFarmName) {
      localStorage.setItem("Flock_farm_name", nextFarmName);
    } else {
      localStorage.removeItem("Flock_farm_name");
    }
  }

  function setUserId(nextUserId) {
    setUserIdState(nextUserId);
    if (nextUserId) {
      localStorage.setItem("Flock_user_id", String(nextUserId));
    } else {
      localStorage.removeItem("Flock_user_id");
    }
  }

  return (
    <FarmContext.Provider value={{ farmName, userId, setFarmName, setUserId }}>
      {children}
    </FarmContext.Provider>
  );
}

export function useFarm() {
  return useContext(FarmContext);
}
