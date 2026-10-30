<p align='center'>
<h1 align='center'>🗺️ Terrain</h1>
<p align='center'>Generate a real world 3D map</p>
</p>

<p align='center'>
<a href="https://map.fleet.im/">Visit Website</a> · <a href="https://github.com/cartesiancs/map3d/issues">Report Bugs</a>
</p>

![img](./.github/screenshot.png)

## About The Project

This is a 3D building mapping service implemented with [React-Three-Fiber](https://github.com/pmndrs/react-three-fiber). It allows exporting as a GLB file, and all features are free to use. Based on this project, various functionalities such as **digital twin**, **drone surveying**, and **GPS markers** can be implemented.

The map files are based on OpenStreetMap data.

> [!IMPORTANT]
> 📢 <strong>This project cannot guarantee the accuracy of the data.</strong> Since it uses OpenStreetMap data, some height values may be missing or incorrectly recorded. To address this issue, an option will be added in the future to allow users to manually correct the data.

## AI capability status

The editor preserves the existing OpenStreetMap and procedural Three.js pipeline. The
AI tools panel reports provenance and availability instead of fabricating predictions:

- OpenStreetMap features are tagged with their source identifier and validated geographic
  coordinates.
- Scene categories are derived from existing OSM tags and remain explicitly source-backed.
- Image-based detection and graph-based route planning are not configured yet and are
  shown as unavailable or planned in the editor.
- Terrain elevation uses the public OpenTopoData `aster30m` endpoint, backed by the
  ASTER Global Digital Elevation Model at approximately 30 m resolution. The provider
  is public, requires no key for the current request path, and may impose rate limits;
  production deployments can set `VITE_DEM_ENDPOINT` to a compatible, approved proxy.
  The dataset is global where ASTER coverage is available and is subject to the
  OpenTopoData service terms and the NASA/METI ASTER GDEM attribution requirements.
  Elevation values use the dataset's metres/datum and are not treated as survey-grade
  measurements. See the [OpenTopoData API documentation](https://www.opentopodata.org/api/)
  before operating a higher-volume deployment.
- The existing photogrammetry upload worker is a separate COLMAP/OpenMVS scaffold; it is
  not claimed to be an AI reconstruction model.

No model weights, imagery credentials, DEM credentials, or paid services are required
for the current default build. See [README-photogrammetry.md](./README-photogrammetry.md)
for the optional local photogrammetry stack.

Run the focused DEM processing test with `npm run test:dem`.

## Roadmap

- [x] Create 3D Buildings
- [x] Create Roads
- [x] Export GLB
- [ ] Building Texture
- [ ] Height Customization
- [ ] Material
- [ ] Heightmap

## Demo

https://github.com/user-attachments/assets/1b61c2f8-dcf9-40bb-9804-59f6a74594dc

## Contributors

Hyeong Jun Huh [(GitHub)](https://github.com/DipokalLab)

## License

MIT License
