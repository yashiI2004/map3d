import { normalizeDEMResults } from "./dem.ts";

const points = [
  { lat: 10, lng: 20 },
  { lat: 10, lng: 21 },
  { lat: 11, lng: 20 },
];

const samples = normalizeDEMResults(points, [
  { elevation: 100 },
  { elevation: null },
  { elevation: 130 },
]);

if (samples.length !== 3) throw new Error("Expected one normalized sample per valid point.");
if (samples[1].elevation !== 100) throw new Error("Missing elevation should use the nearest valid sample.");
if (samples[2].elevation !== 130) throw new Error("Valid elevation should be preserved.");

let rejected = false;
try {
  normalizeDEMResults(points, [{ elevation: null }, { elevation: null }, { elevation: null }]);
} catch {
  rejected = true;
}
if (!rejected) throw new Error("A response with no valid elevations must be rejected.");
