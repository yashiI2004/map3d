import { create } from "zustand";

type ControlKey = "forward" | "backward" | "left" | "right";

type CarControls = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
};

type CarStore = {
  thirdMode: boolean;
  controls: CarControls;

  setThirdMode: (thirdMode: boolean) => void;
  setControl: (key: ControlKey, active: boolean) => void;
  resetControls: () => void;
};

export const useCarStore = create<CarStore>((set) => ({
  thirdMode: false,
  controls: {
    forward: false,
    backward: false,
    left: false,
    right: false,
  },
  setThirdMode: (thirdMode) => set(() => ({ thirdMode })),
  setControl: (key, active) =>
    set((state) => ({
      controls: {
        ...state.controls,
        [key]: active,
      },
    })),
  resetControls: () =>
    set(() => ({
      controls: {
        forward: false,
        backward: false,
        left: false,
        right: false,
      },
    })),
}));
