// Leaflet with the leaflet-providers plugin, so one dynamic import downloads
// both at once. leaflet-providers extends the global L that Leaflet sets, so
// Leaflet has to be imported first.
import * as L from "leaflet";
import "leaflet-providers";

export { L };
