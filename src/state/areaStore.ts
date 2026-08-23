import { create } from "zustand";

export type MarkerType = "enemy" | "hospital" | "rescue" | "note" | "soldier";

export type Marker = {
  id: string;
  type: MarkerType;
  x: number;
  z: number;
  note?: string;
  createdAt: number;
};

export type Soldier = {
  id: string;
  name: string;
  unitId: string;
  latitude: number;
  longitude: number;
  altitude: number;
  x: number;
  z: number;
  rotation: number;
  createdAt: number;
};

type MeasurementMode = "none" | "distance" | "area" | "building-height";

type MeasurementPoint = {
  x: number;
  z: number;
};

type MeasurementResult = {
  distance?: number;
  area?: number;
  width?: number;
  depth?: number;
  buildingHeight?: number;
  buildingName?: string;
};

type ShapePoint = {
  x: number;
  z: number;
};

type FilledShape = {
  id: string;
  points: ShapePoint[];
  color: string;
  createdAt: number;
};

type AreaStore = {
  areas: any;
  features: any[];
  center: {
    lat: number;
    lng: number;
  }[];
  markers: Marker[];
  soldiers: Soldier[];
  selectedSoldierId: string | null;
  measurementSoldierIds: string[];
  selectedMarkerType: MarkerType;
  noteText: string;
  planMode: boolean;
  advanceMode: boolean;
  advancePoints: ShapePoint[];
  advanceColor: string;
  filledShapes: FilledShape[];
  measureMode: MeasurementMode;
  measurePoints: MeasurementPoint[];
  measureResult: MeasurementResult;
  measurementAdvanced: boolean;
  measurementOverrides: Partial<MeasurementResult>;

  appendAreas: (areas: any[]) => void;
  setCenter: (center: any[]) => void;
  setFeatures: (features: any[]) => void;
  setSelectedMarkerType: (type: MarkerType) => void;
  setNoteText: (text: string) => void;
  setPlanMode: (enabled: boolean) => void;
  setAdvanceMode: (enabled: boolean) => void;
  addAdvancePoint: (point: ShapePoint) => void;
  clearAdvancePoints: () => void;
  completeAdvanceShape: () => void;
  clearAdvanceShapes: () => void;
  setAdvanceColor: (color: string) => void;
  addMarker: (marker: Omit<Marker, "id" | "createdAt">) => void;
  removeMarker: (id: string) => void;
  clearMarkers: () => void;
  addSoldier: (soldier: Omit<Soldier, "id" | "createdAt">) => string;
  updateSoldier: (id: string, updates: Partial<Pick<Soldier, "name" | "unitId" | "latitude" | "longitude" | "altitude" | "x" | "z">>) => void;
  removeSoldier: (id: string) => void;
  selectSoldier: (id: string | null) => void;
  toggleMeasurementSoldier: (id: string) => void;
  clearMeasurementSoldiers: () => void;
  setMeasureMode: (mode: MeasurementMode) => void;
  addMeasurePoint: (point: MeasurementPoint) => void;
  clearMeasurements: () => void;
  setMeasureResult: (result: MeasurementResult) => void;
  toggleMeasurementAdvanced: (enabled: boolean) => void;
  setMeasurementOverride: (key: keyof MeasurementResult, value: number | string | undefined) => void;
};

const STORAGE_KEY = "terrain-markers";
const SOLDIER_STORAGE_KEY = "terrain-soldiers";

const readMarkers = (): Marker[] => {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const writeMarkers = (markers: Marker[]) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(markers));
  }
};

const readSoldiers = (): Soldier[] => {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(SOLDIER_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const writeSoldiers = (soldiers: Soldier[]) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SOLDIER_STORAGE_KEY, JSON.stringify(soldiers));
  }
};

export const useAreaStore = create<AreaStore>((set, get) => ({
  areas: [],
  features: [],
  center: [
    {
      lat: 40.8,
      lng: -73.95,
    },
    {
      lat: 40.83,
      lng: -73.88,
    },
  ],
  markers: readMarkers(),
  soldiers: readSoldiers(),
  selectedSoldierId: null,
  measurementSoldierIds: [],
  selectedMarkerType: "enemy",
  noteText: "",
  planMode: false,
  advanceMode: false,
  advancePoints: [],
  advanceColor: "#d97706",
  filledShapes: [],
  measureMode: "none",
  measurePoints: [],
  measureResult: {},
  measurementAdvanced: false,
  measurementOverrides: {},
  appendAreas: (areas) => set(() => ({ areas: [...areas] })),
  setCenter: (center) => set(() => ({ center: [...center] })),
  setFeatures: (features) => set(() => ({ features: [...features] })),
  setSelectedMarkerType: (type) => set(() => ({ selectedMarkerType: type })),
  setNoteText: (text) => set(() => ({ noteText: text })),
  setPlanMode: (enabled) => set(() => ({ planMode: enabled, selectedMarkerType: enabled ? "soldier" : "enemy" })),
  setAdvanceMode: (enabled) =>
    set((state) => ({
      advanceMode: enabled,
      advancePoints: enabled ? [] : state.advancePoints,
      planMode: enabled ? false : state.planMode,
    })),
  addAdvancePoint: (point) =>
    set((state) => ({ advancePoints: [...state.advancePoints, point] })),
  clearAdvancePoints: () => set(() => ({ advancePoints: [] })),
  completeAdvanceShape: () =>
    set((state) => {
      if (state.advancePoints.length < 3) return state;
      const nextShape: FilledShape = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        points: [...state.advancePoints],
        color: state.advanceColor,
        createdAt: Date.now(),
      };
      return {
        filledShapes: [...state.filledShapes, nextShape],
        advancePoints: [],
      };
    }),
  clearAdvanceShapes: () => set(() => ({ filledShapes: [] })),
  setAdvanceColor: (color) => set(() => ({ advanceColor: color })),
  addMarker: (marker) => {
    const nextMarker: Marker = {
      ...marker,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: Date.now(),
    };
    const nextMarkers = [...get().markers, nextMarker];
    writeMarkers(nextMarkers);
    set(() => ({ markers: nextMarkers }));
  },
  removeMarker: (id) => {
    const nextMarkers = get().markers.filter((marker) => marker.id !== id);
    writeMarkers(nextMarkers);
    set(() => ({ markers: nextMarkers }));
  },
  clearMarkers: () => {
    writeMarkers([]);
    set(() => ({ markers: [] }));
  },
  addSoldier: (soldier) => {
    const id = `${soldier.unitId || "soldier"}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const nextSoldiers = [...get().soldiers, { ...soldier, id, createdAt: Date.now() }];
    writeSoldiers(nextSoldiers);
    set(() => ({ soldiers: nextSoldiers, selectedSoldierId: id }));
    return id;
  },
  updateSoldier: (id, updates) => {
    const nextSoldiers = get().soldiers.map((soldier) => soldier.id === id ? { ...soldier, ...updates } : soldier);
    writeSoldiers(nextSoldiers);
    set(() => ({ soldiers: nextSoldiers }));
  },
  removeSoldier: (id) => {
    const nextSoldiers = get().soldiers.filter((soldier) => soldier.id !== id);
    writeSoldiers(nextSoldiers);
    set((state) => ({
      soldiers: nextSoldiers,
      selectedSoldierId: state.selectedSoldierId === id ? null : state.selectedSoldierId,
      measurementSoldierIds: state.measurementSoldierIds.filter((selectedId) => selectedId !== id),
    }));
  },
  selectSoldier: (id) => set(() => ({ selectedSoldierId: id })),
  toggleMeasurementSoldier: (id) =>
    set((state) => ({
      measurementSoldierIds: state.measurementSoldierIds.includes(id)
        ? state.measurementSoldierIds.filter((selectedId) => selectedId !== id)
        : [...state.measurementSoldierIds, id],
    })),
  clearMeasurementSoldiers: () => set(() => ({ measurementSoldierIds: [] })),
  setMeasureMode: (mode) => set(() => ({ measureMode: mode, measurePoints: [], measureResult: {} })),
  addMeasurePoint: (point) =>
    set((state) => {
      const points = [...state.measurePoints, point].slice(-2);
      return { measurePoints: points };
    }),
  clearMeasurements: () => set(() => ({ measureMode: "none", measurePoints: [], measureResult: {} })),
  setMeasureResult: (result) => set(() => ({ measureResult: result })),
  toggleMeasurementAdvanced: (enabled) => set(() => ({ measurementAdvanced: enabled })),
  setMeasurementOverride: (key, value) =>
    set((state) => ({
      measurementOverrides: {
        ...state.measurementOverrides,
        [key]: value,
      },
    })),
}));
