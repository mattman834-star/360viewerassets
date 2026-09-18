

// Authenticate with your Ion access token so private assets can be loaded.
Cesium.Ion.defaultAccessToken =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjF4TTVFcGJ6RFJkend3UHkiLCJqdGkiOiI4MDU4ZTAwMC0zYzk2LTRlNmMtYTUyMi1kOWFiYmJmYzQ3MjYiLCJpZCI6NDUzMTgxLCJzdWIiOiJNZWFuU2NhbGxvcDE1NTMiLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoic2FuZGNhc3RsZSIsImlhdCI6MTc4OTY5NTYzMH0.mZG3SGav09JZPX9CCeT3r9gfMuhKbSSG44tuhAcICV0";

// Single 3D view. (The 2D split-screen view was removed; a minimap image may
// replace it later.)
const view3D = new Cesium.Viewer("view3D", {
  fullscreenButton: false,
  sceneModePicker: false,
  // Don't request the default Ion base imagery (asset 2); this token is not
  // authorized for it. We use Photorealistic 3D Tiles instead.
  baseLayer: false,
  // The BaseLayerPicker builds default provider view models that probe Ion
  // asset 2 (Bing base imagery). This token isn't authorized for asset 2, so
  // disable the picker and the Ion geocoder.
baseLayerPicker: false,
geocoder: false,
// Don't show the green selection box / info box when a sphere is clicked.
selectionIndicator: false,
infoBox: false,
});

// ----------------------------------------------------------------------------
// Load Google Photorealistic 3D Tiles and the 360-image sphere locations.
// ----------------------------------------------------------------------------

// The 360-image locations, hardcoded. Each point is placed 6 feet
// (1.8288 m) above the ground. The GitHub "blob" links have been converted
// to raw.githubusercontent.com URLs so the images actually load.
const HEIGHT_METERS = 6 * 0.3048; // 6 feet
const panoData = [
  {
name: "Point 1",
lon: -(149 + 0 / 60 + 0.22 / 3600),
lat: 61 + 40 / 60 + 2.52 / 3600,
url: "https://raw.githubusercontent.com/mattman834-star/360viewerassets/main/9_17_2026.jpg",
// Per-point rotation (degrees) to align the image with true north.
// Tune each value until image features line up with the world spheres.
headingOffset: -47,
// Per-point tilt (degrees) to shift the image up/down (level the horizon).
pitchOffset: 0,
heightOffset: -1,
},
{
name: "Point 2",
lon: -(149 + 0 / 60 + 4.18 / 3600),
lat: 61 + 40 / 60 + 2.51 / 3600,
url: "https://raw.githubusercontent.com/mattman834-star/360viewerassets/main/9_17_2026%20(1).jpg",
// Point 2 looks correct at 0.
headingOffset: -5,
heightOffset: -1,
},
{
name: "Point 3",
lon: -(149 + 0 / 60 + 9.73 / 3600),
lat: 61 + 40 / 60 + 2.42 / 3600,
url: "https://raw.githubusercontent.com/mattman834-star/360viewerassets/main/9_17_2026%20(2).jpg",
headingOffset: 117,
heightOffset: -3,
},
];

// Ordered list of the 360-image sphere entities
let panoEntities = [];

// Bounding sphere framing all pano locations; used to return to the overview
// when exiting a panorama.
let overviewBoundingSphere;

// The Photorealistic 3D Tileset. Hidden while inside a panorama so the tiles
// don't cover the 360 image (the pano spheres stay visible regardless).
let tileset;

// Add a sphere for each 360-image location. Positions use absolute heights
// (p.height, sampled from the 3D tiles) so the points stay put instead of
// clamping against the hidden globe terrain.
function addSpheres(viewer) {
  const entities = [];
  panoData.forEach((p, i) => {
    const entity = viewer.entities.add({
      name: p.name,
      position: Cesium.Cartesian3.fromDegrees(
        p.lon,
        p.lat,
        (p.height ?? 0) + HEIGHT_METERS,
      ),
      point: new Cesium.PointGraphics({
        pixelSize: 14,
        color: Cesium.Color.BLUE.withAlpha(0.9),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      }),
    });
    entity.panoIndex = i;
    entities.push(entity);
  });
  return entities;
}

async function loadScene() {
// Google Photorealistic 3D Tiles (Ion asset 2275207).
try {
    view3D.scene.globe.show = false;
    tileset = await Cesium.Cesium3DTileset.fromIonAssetId(2275207);
    view3D.scene.primitives.add(tileset);
  } catch (error) {
    console.error(
      "Failed to load Photorealistic 3D Tiles asset 2275207:",
      error,
    );
  }

  // Sample the true surface height of each point off the 3D Tileset. Because
  // the globe is hidden, HeightReference clamping won't work; instead we bake
  // an absolute height into each point so it stays anchored to the tiles.
  if (Cesium.defined(tileset)) {
    try {
      const samplePositions = panoData.map((p) =>
        Cesium.Cartographic.fromDegrees(p.lon, p.lat),
      );
      // NOTE: the second argument is `objectsToExclude`, NOT a list of
      // objects to sample against. We want to sample the surface of the
      // Photorealistic tileset, so we must NOT exclude it here.
      const sampled =
        await view3D.scene.sampleHeightMostDetailed(samplePositions);
      sampled.forEach((carto, i) => {
        if (Cesium.defined(carto) && Cesium.defined(carto.height)) {
          panoData[i].height = carto.height;
        }
      });
    } catch (error) {
      console.error("Failed to sample heights off the tileset:", error);
    }
  }

  // Add the 360-image spheres (now with absolute heights)
  panoEntities = addSpheres(view3D);

  // Fly to the 360-image locations. We frame an explicit bounding sphere
  // around the points (at their true sampled heights) with a comfortable
  // offset so the camera doesn't end up right on the ground / underground.
  const positions = panoData.map((p) =>
    Cesium.Cartesian3.fromDegrees(
      p.lon,
      p.lat,
      (p.height ?? 0) + HEIGHT_METERS,
    ),
  );
overviewBoundingSphere = Cesium.BoundingSphere.fromPoints(positions);
view3D.camera.flyToBoundingSphere(overviewBoundingSphere, {
    duration: 2,
    offset: new Cesium.HeadingPitchRange(
      0.0,
      Cesium.Math.toRadians(-35.0),
      250.0,
    ),
  });
}

loadScene();

// ----------------------------------------------------------------------------
// ROW & Easement lines (GeoJSON hosted on GitHub, clamped onto the 3D tiles).
// ----------------------------------------------------------------------------
const ROW_GEOJSON_URL =
  "https://raw.githubusercontent.com/mattman834-star/360viewerassets/main/ROW_and_Easements.geojson";

async function loadRowGeoJson() {
  try {
    const dataSource = await Cesium.GeoJsonDataSource.load(ROW_GEOJSON_URL, {
      clampToGround: true,
    });
    dataSource.entities.values.forEach((entity) => {
      if (Cesium.defined(entity.polyline)) {
        entity.polyline.material = Cesium.Color.WHITE;
        entity.polyline.width = 3;
      }
      // Some ROW/easement features may come in as polygons; show their outline.
      if (Cesium.defined(entity.polygon)) {
        entity.polygon.material = Cesium.Color.WHITE.withAlpha(0.15);
        entity.polygon.outline = true;
        entity.polygon.outlineColor = Cesium.Color.WHITE;
      }
    });
    await view3D.dataSources.add(dataSource);
  } catch (error) {
    console.error("Failed to load ROW/Easement GeoJSON:", error);
  }
}

loadRowGeoJson();

// ----------------------------------------------------------------------------
// Cadastral parcels (GeoJSON hosted on GitHub, clamped onto the 3D tiles).
// Drawn as dashed cyan lines to contrast with the solid yellow ROW lines.
// ----------------------------------------------------------------------------
const PARCELS_GEOJSON_URL =
  "https://raw.githubusercontent.com/mattman834-star/360viewerassets/main/Cadastral_Parcels.geojson";

async function loadParcelsGeoJson() {
  try {
    const dataSource = await Cesium.GeoJsonDataSource.load(
      PARCELS_GEOJSON_URL,
      {
        clampToGround: true,
      },
    );
const dashMaterial = new Cesium.ColorMaterialProperty(Cesium.Color.CYAN);
    dataSource.entities.values.forEach((entity) => {
      if (Cesium.defined(entity.polyline)) {
        entity.polyline.material = dashMaterial;
        entity.polyline.width = 2;
      }
      // Parcels usually come in as polygons; show a dashed cyan outline only.
      if (Cesium.defined(entity.polygon)) {
        entity.polygon.fill = false;
        entity.polygon.outline = false;
        const positions = entity.polygon.hierarchy.getValue(
          Cesium.JulianDate.now(),
        ).positions;
        view3D.entities.add({
          polyline: new Cesium.PolylineGraphics({
            positions: positions.concat([positions[0]]),
            width: 2,
            material: dashMaterial,
            clampToGround: true,
          }),
        });
      }
    });
    await view3D.dataSources.add(dataSource);
  } catch (error) {
    console.error("Failed to load Parcels GeoJSON:", error);
  }
}

loadParcelsGeoJson();

// Preload the panorama images in the background so that clicking a sphere
// displays instantly (the browser caches them) instead of fetching the large
// equirectangular JPG on every click.
panoData.forEach((p) => {
  if (p.url) {
    const img = new Image();
    img.src = p.url;
  }
});

// ----------------------------------------------------------------------------
// 360 panorama viewer (rendered IN the 3D scene)
// ----------------------------------------------------------------------------
// Each panorama is an EquirectangularPanorama primitive placed at the sphere's
// world position. Because it lives in the scene (not a DOM overlay), the other
// location spheres keep rendering on top (they have depth-test disabled) and
// stay clickable — so you can see and jump to other 360 locations while inside
// a panorama.
const controller = view3D.scene.screenSpaceCameraController;
const DEFAULT_FOV = Cesium.Math.toRadians(60.0);

let currentPanorama;
let currentPanoIndex = -1;

// Build the in-scene panorama UI (label + controls) as our own DOM elements.
const panoLabel = document.createElement("div");
panoLabel.id = "panoLabel";
panoLabel.style.cssText =
  "position:fixed;top:12px;left:12px;z-index:1001;color:#fff;" +
  "background:rgba(0,0,0,0.5);padding:6px 10px;border-radius:4px;" +
  "font-family:sans-serif;font-size:13px;display:none;pointer-events:none;";
document.body.appendChild(panoLabel);

const panoControls = document.createElement("div");
panoControls.id = "panoControls";
panoControls.style.cssText =
  "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);" +
  "z-index:1001;display:none;gap:8px;";
document.body.appendChild(panoControls);

function makeButton(text, onClick) {
  const b = document.createElement("button");
  b.className = "cesium-button";
  b.textContent = text;
  b.style.cursor = "pointer";
  b.addEventListener("click", onClick);
  panoControls.appendChild(b);
  return b;
}
makeButton("\u25C0 Prev", () =>
  enterPano((currentPanoIndex - 1 + panoData.length) % panoData.length),
);
makeButton("Back to 3D", exitPano);
makeButton("Next \u25B6", () =>
  enterPano((currentPanoIndex + 1) % panoData.length),
);
const tilesToggleButton = makeButton("Show 3D Tiles", () => {
  if (!Cesium.defined(tileset)) {
    return;
  }
  tileset.show = !tileset.show;
  tilesToggleButton.textContent = tileset.show
    ? "Hide 3D Tiles"
    : "Show 3D Tiles";
});

function clearPanorama() {
  if (Cesium.defined(currentPanorama)) {
    view3D.scene.primitives.remove(currentPanorama);
    currentPanorama = undefined;
  }
}

function enterPano(index) {
  if (index < 0 || index >= panoData.length) {
    return;
  }
  const p = panoData[index];
  if (!p.url) {
    return;
  }
currentPanoIndex = index;

// Hide the 3D tiles in panorama mode so they don't cover the 360 image.
if (Cesium.defined(tileset)) {
  tileset.show = false;
  tilesToggleButton.textContent = "Show 3D Tiles";
}

// heightOffset (meters) shifts the whole panorama up/down in altitude so it
// lines up vertically with the 3D tiles. Tweak per point as needed.
const heightOffset = Cesium.defined(p.heightOffset) ? p.heightOffset : 0.0;
const position = Cesium.Cartesian3.fromDegrees(
  p.lon,
  p.lat,
  (p.height ?? 0) + HEIGHT_METERS + heightOffset,
);
const transform = Cesium.Transforms.eastNorthUpToFixedFrame(position);

// The equirectangular image's forward direction isn't aligned to true north,
// so rotate the panorama about its local up (Z) axis so features in the image
// line up with the correctly-placed world spheres. Tweak headingOffset per
// point if individual captures were shot at different orientations.
const headingOffset = Cesium.defined(p.headingOffset)
  ? p.headingOffset
  : -0.0;
Cesium.Matrix4.multiplyByMatrix3(
  transform,
  Cesium.Matrix3.fromRotationZ(Cesium.Math.toRadians(headingOffset)),
  transform,
);

// Tilt the panorama up/down about its local east (X) axis to shift the image
// vertically / level the horizon. Tweak pitchOffset per point as needed.
const pitchOffset = Cesium.defined(p.pitchOffset) ? p.pitchOffset : 0.0;
Cesium.Matrix4.multiplyByMatrix3(
  transform,
  Cesium.Matrix3.fromRotationX(Cesium.Math.toRadians(pitchOffset)),
  transform,
);

// Hide this location's own sphere so it doesn't sit in the center of the
// panorama. Other locations' spheres stay visible/clickable.
panoEntities.forEach((e, i) => {
  e.show = i !== index;
});

clearPanorama();
  currentPanorama = view3D.scene.primitives.add(
    new Cesium.EquirectangularPanorama({
      transform,
      image: p.url,
    }),
  );

  // Look at the panorama center with a tiny range so the camera can rotate/tilt
  // but stays "inside" the panorama. Disable zoom/translate to keep the user put.
  view3D.camera.lookAt(position, new Cesium.HeadingPitchRange(0, 0, 2));
  controller.enableZoom = false;
  controller.enableTranslate = false;

  const name = p.name || `Location ${index + 1}`;
  panoLabel.textContent = `${name}  (${index + 1} / ${panoData.length})`;
  panoLabel.style.display = "block";
  panoControls.style.display = "flex";
}

function exitPano() {
clearPanorama();
currentPanoIndex = -1;
// Restore all location spheres now that we're back in the overview.
panoEntities.forEach((e) => {
  e.show = true;
});
// Show the 3D tiles again now that we're back in the overview.
if (Cesium.defined(tileset)) {
  tileset.show = true;
}
view3D.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  controller.enableZoom = true;
  controller.enableTranslate = true;
  view3D.camera.frustum.fov = DEFAULT_FOV;
  panoLabel.style.display = "none";
  panoControls.style.display = "none";
  if (Cesium.defined(overviewBoundingSphere)) {
    view3D.camera.flyToBoundingSphere(overviewBoundingSphere, {
      duration: 1.5,
      offset: new Cesium.HeadingPitchRange(
        0.0,
        Cesium.Math.toRadians(-35.0),
        250.0,
      ),
    });
  }
}

// Mouse-wheel narrows/widens the field of view to simulate zoom while inside a
// panorama (normal camera zoom is disabled in pano mode).
const minFov = Cesium.Math.toRadians(20.0);
const maxFov = Cesium.Math.toRadians(100.0);
const zoomSpeed = 0.05;
const wheelHandler = new Cesium.ScreenSpaceEventHandler(view3D.scene.canvas);
wheelHandler.setInputAction((delta) => {
  if (currentPanoIndex < 0) {
    return;
  }
  const frustum = view3D.camera.frustum;
  let fov = frustum.fov;
  fov *= delta < 0 ? 1.0 + zoomSpeed : 1.0 - zoomSpeed;
  frustum.fov = Cesium.Math.clamp(fov, minFov, maxFov);
}, Cesium.ScreenSpaceEventType.WHEEL);

// ----------------------------------------------------------------------------
// Clicking a sphere enters (or switches to) that 360 panorama. This works in
// 3D mode AND while already inside a panorama, since the spheres stay visible.
// ----------------------------------------------------------------------------
const clickHandler = new Cesium.ScreenSpaceEventHandler(view3D.scene.canvas);
clickHandler.setInputAction((movement) => {
  const picked = view3D.scene.pick(movement.position);
  if (!Cesium.defined(picked) || !Cesium.defined(picked.id)) {
    return;
  }
  const pickedId = picked.id.id;
  const index = panoEntities.findIndex((e) => e.id === pickedId);
  if (index >= 0) {
    enterPano(index);
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);
