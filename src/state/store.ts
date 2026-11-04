import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SaveData } from '../engine/rules';

/**
 * Single source of persisted truth. The Game engine owns a working copy and
 * commits snapshots here; zustand-persist writes them to AsyncStorage so
 * steps, partner, inventory and map progress survive restarts.
 */
interface StoreState {
  save: SaveData | null;
  hydrated: boolean;
  setSave: (s: SaveData) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      save: null,
      hydrated: false,
      setSave: (save) => set({ save }),
    }),
    {
      name: 'stride3-save',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ save: s.save }),
      onRehydrateStorage: () => () => {
        useStore.setState({ hydrated: true });
      },
    },
  ),
);
