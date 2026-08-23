/* =========================================================================
   Best Tourist Spots for You and Your Family — Caraga Region, Philippines
   Leaflet + GeoJSON interactive family travel map.
   ========================================================================= */

// ---- Category display config ---------------------------------------------
const CATEGORY_META = {
  beaches: { label: "Beaches & Islands", color: "#1c98a0" },
  waterfalls: { label: "Waterfalls & Rivers", color: "#2f6fa8" },
  mountains: { label: "Mountains & Nature", color: "#4d7c3e" },
  heritage: { label: "Heritage & Culture", color: "#a1502f" }
};

// Inline icon markup (viewBox 0 0 24 24), duplicated from the page's icon
// sprite. Pin markers use these directly instead of <use href="#icon-x">
// so they render even if the sprite is missing, stripped, or the page is
// served from a host/CDN that mishandles same-document SVG fragment refs.
const CATEGORY_ICON_PATHS = {
  beaches: `
    <path d="M2 20c1.8-1.4 3.2-1.4 5 0 1.8 1.4 3.2 1.4 5 0 1.8-1.4 3.2-1.4 5 0 1.8 1.4 3.2 1.4 5 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M12 15V6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M12 6c0 0-5-1-6 4 5 1 6-4 6-4Z" fill="currentColor"/>
    <path d="M12 9c0 0 4.5-1.5 5.5 2.5-4.5 1-5.5-2.5-5.5-2.5Z" fill="currentColor"/>
  `,
  waterfalls: `
    <path d="M6 3c0 3-2 4-2 7s2 4 2 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M12 3c0 3-2 4-2 7s2 4 2 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M18 3c0 3-2 4-2 7s2 4 2 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M2 20.5h20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  `,
  mountains: `
    <path d="M2 19 8.5 8l4 6.5L15 11l7 8Z" fill="currentColor" opacity="0.92"/>
    <circle cx="17.5" cy="5.5" r="2.1" fill="currentColor"/>
  `,
  heritage: `
    <path d="M3 17.5c3-2.4 6-3.6 9-3.6s6 1.2 9 3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M4 17c1-5 4-9 8-11 4 2 7 6 8 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="12" cy="8.4" r="1.3" fill="currentColor"/>
  `
};

// ---- Province files -------------------------------------------------------
const PROVINCE_FILES = [
  "dinagat.json",
  "surdel_norte.json",
  "sudel_sur.json",
  "del_sur.json",
  "del_norte.json"
];

let provincesData = null;

async function loadProvinces() {
  if (provincesData) return provincesData;

  const files = await Promise.all(
    PROVINCE_FILES.map(file =>
      fetch(`data/${file}`).then(r => {
        if (!r.ok) throw new Error(`Failed to load ${file}`);
        return r.json();
      })
    )
  );

  provincesData = {
    type: "FeatureCollection",
    features: files.flatMap(file => file.features)
  };

  // Make sure every province has a "province" property
  provincesData.features.forEach(feature => {
    feature.properties.province =
      feature.properties.province ||
      feature.properties.name;
  });

  return provincesData;
}

// ---- Map init -------------------------------------------------------------
const map = L.map("map", {
  zoomControl: false,
  minZoom: 6
}).setView([8.95, 125.95], 9);

L.control.zoom({ position: "bottomright" }).addTo(map);

// ---- Basemaps -------------------------------------------------------------
const basemaps = {
  osm: L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }
  ),

  light: L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19
    }
  ),

  dark: L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19
    }
  )
};

basemaps.osm.addTo(map);

document.getElementById("basemapSwitch").addEventListener("click", e => {
  const btn = e.target.closest("button[data-basemap]");
  if (!btn) return;

  const key = btn.dataset.basemap;

  Object.values(basemaps).forEach(layer => map.removeLayer(layer));
  basemaps[key].addTo(map);

  document
    .querySelectorAll("#basemapSwitch button")
    .forEach(btn => btn.classList.remove("active"));

  btn.classList.add("active");
});

// ---- State ----------------------------------------------------------------
let provinceLayer = null;
let spotsData = null;
let categoryLayers = {};
let markerIndex = [];
let routeLayer = null;
let spotCountByProvince = {};

// ---- Helpers --------------------------------------------------------------
function pointInRing(point, ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

function pointInPolygonFeature(point, geometry) {
  if (geometry.type === "Polygon") {
    return pointInRing(point, geometry.coordinates[0]);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some(poly =>
      pointInRing(point, poly[0])
    );
  }

  return false;
}

// ---- Popup ----------------------------------------------------------------
function buildPopupHtml(props) {
  const cat = props.category;
  const meta = CATEGORY_META[cat] || { label: cat };

  return `
    <div class="spot-card">
      <div class="card-header header-${cat}">
        <span class="header-icon">
          <svg><use href="#icon-${cat}"/></svg>
        </span>
        <span class="cat-pill">${meta.label}</span>
      </div>

      <div class="card-body">
        <h3>${props.spot_name}</h3>
        <p class="muni">${props.municipality}</p>
        <p class="desc">${props.description}</p>

        <dl>
          <dt><svg><use href="#icon-fee"/></svg>Fee</dt>
          <dd>${props.entrance_fee}</dd>

          <dt><svg><use href="#icon-season"/></svg>Season</dt>
          <dd>${props.best_season}</dd>

          <dt><svg><use href="#icon-family"/></svg>Family</dt>
          <dd>${props.family_friendly}</dd>
        </dl>
      </div>
    </div>
  `;
}

// ---- Spot detail panel (left sidebar) --------------------------------------
const spotDetailPanel = document.getElementById("spotDetailPanel");
const spotDetailBody = document.getElementById("spotDetailBody");
const spotDetailClose = document.getElementById("spotDetailClose");

function buildDetailHtml(props) {
  const cat = props.category;
  const meta = CATEGORY_META[cat] || { label: cat };
  const hasPhoto = Boolean(props.image);

  const heroClasses = [
    "detail-hero",
    `header-${cat}`,
    hasPhoto ? "" : "illustrated"
  ].filter(Boolean).join(" ");

  const heroMedia = hasPhoto
    ? `<img src="${props.image}" alt="${props.spot_name}" loading="lazy" />`
    : "";

  const heroIcon = hasPhoto
    ? ""
    : `<span class="detail-hero-icon"><svg><use href="#icon-${cat}"/></svg></span>`;

  const credit = hasPhoto && props.image_credit
    ? `<p class="detail-credit">Photo: ${props.image_credit}</p>`
    : "";

  return `
    <div class="${heroClasses}">
      ${heroMedia}
      ${heroIcon}
      <span class="detail-cat-pill">${meta.label}</span>
    </div>

    <div class="detail-body">
      <h3>${props.spot_name}</h3>
      <p class="muni">${props.municipality}</p>
      <p class="desc">${props.description}</p>
      ${credit}

      <dl>
        <dt><svg><use href="#icon-fee"/></svg>Fee</dt>
        <dd>${props.entrance_fee}</dd>

        <dt><svg><use href="#icon-season"/></svg>Season</dt>
        <dd>${props.best_season}</dd>

        <dt><svg><use href="#icon-family"/></svg>Family</dt>
        <dd>${props.family_friendly}</dd>
      </dl>
    </div>
  `;
}

function showSpotDetail(props) {
  if (!spotDetailPanel || !spotDetailBody) return;

  spotDetailBody.innerHTML = buildDetailHtml(props);
  spotDetailPanel.classList.add("open");
  spotDetailPanel.scrollTop = 0;

  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.classList.remove("collapsed");
}

function hideSpotDetail() {
  if (spotDetailPanel) spotDetailPanel.classList.remove("open");
}

if (spotDetailClose) {
  spotDetailClose.addEventListener("click", hideSpotDetail);
}

// ---- Province style -------------------------------------------------------
function provinceStyle(feature) {
  const province =
    feature.properties.province ||
    feature.properties.name;

  const count = spotCountByProvince[province] || 0;

  const scale = [
    "#f4ede0",
    "#e8dcc0",
    "#dcc98f",
    "#c9ac5b",
    "#b5912f"
  ];

  return {
    color: "#0b3f3b",
    weight: 1.6,
    opacity: 0.85,
    fillColor: scale[Math.min(count, scale.length - 1)],
    fillOpacity: 0.55
  };
}

function highlightProvince(e) {
  const layer = e.target;

  layer.setStyle({
    weight: 3.5,
    color: "#e2a33a",
    fillOpacity: 0.72
  });

  layer.bringToFront();
}

function resetProvinceStyle(e) {
  if (provinceLayer) {
    provinceLayer.resetStyle(e.target);
  }
}

function zoomToProvince(e) {
  map.fitBounds(e.target.getBounds(), {
    padding: [30, 30]
  });

  const p = e.target.feature.properties;

  const province = p.province || p.name;
  const count = spotCountByProvince[province] || 0;

  e.target
    .bindPopup(`
      <div class="province-popup">
        <strong>${province}</strong><br/>
        ${count} featured spot${count === 1 ? "" : "s"} on this map
      </div>
    `)
    .openPopup(e.latlng);
}

// ---- Load province boundaries --------------------------------------------
async function createProvinceLayer() {
  try {
    const geo = await loadProvinces();

    provinceLayer = L.geoJSON(geo, {
      style: provinceStyle,

      onEachFeature: (feature, layer) => {
        layer.on({
          mouseover: highlightProvince,
          mouseout: resetProvinceStyle,
          click: zoomToProvince
        });
      }
    }).addTo(map);

    provinceLayer.bringToBack();

    buildProvinceLegend(geo);

  } catch (err) {
    console.error(
      "Failed to load province boundaries:",
      err
    );
  }
}

// ---- Province legend ------------------------------------------------------
function buildProvinceLegend(geo) {
  const ul = document.getElementById("provinceLegend");

  if (!ul) return;

  ul.innerHTML = "";

  geo.features.forEach(feature => {
    const province =
      feature.properties.province ||
      feature.properties.name;

    const li = document.createElement("li");

    li.innerHTML = `
      <span>${province}</span>
      <span class="count" data-prov="${province}">0</span>
    `;

    li.addEventListener("click", () => {
      if (!provinceLayer) return;

      provinceLayer.eachLayer(layer => {
        const layerProvince =
          layer.feature.properties.province ||
          layer.feature.properties.name;

        if (layerProvince === province) {
          map.fitBounds(layer.getBounds(), {
            padding: [30, 30]
          });
        }
      });
    });

    ul.appendChild(li);
  });
}

// ---- Province border toggle ------------------------------------------------
document
  .getElementById("toggleProvinceBorders")
  .addEventListener("click", e => {

    const btn = e.currentTarget;

    if (!provinceLayer) return;

    const nowActive =
      !btn.classList.contains("active");

    btn.classList.toggle(
      "active",
      nowActive
    );

    btn.querySelector(".chip-label").textContent =
      nowActive
        ? "Show province borders"
        : "Show province borders (hidden)";

    btn.classList.remove("chip-pop");
    void btn.offsetWidth;
    btn.classList.add("chip-pop");

    if (nowActive) {
      provinceLayer.addTo(map);
      provinceLayer.bringToBack();
    } else {
      map.removeLayer(provinceLayer);
    }
  });

function refreshProvinceCounts() {
  document
    .querySelectorAll(".province-legend .count")
    .forEach(el => {
      const province = el.dataset.prov;

      el.textContent =
        spotCountByProvince[province] || 0;
    });

  if (provinceLayer) {
    provinceLayer.setStyle(provinceStyle);
  }
}

// ---- Custom marker --------------------------------------------------------
const PIN_SHAPE_SVG = `
  <svg
    class="pin-shape"
    viewBox="0 0 34 44"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M17 0C7.6 0 0 7.6 0 17c0 11 17 27 17 27s17-16 17-27C34 7.6 26.4 0 17 0Z"
      fill="var(--pin-color)"
      stroke="#fffdf8"
      stroke-width="1.6"
    />

    <circle
      cx="17"
      cy="17"
      r="7.5"
      fill="rgba(255,255,255,0)"
    />
  </svg>
`;

function markerForCategory(category) {
  const color =
    (CATEGORY_META[category] || {}).color ||
    "#555";

  let dropIndex = 0;

  return (feature, latlng) => {
    const delay = (dropIndex++ % 10) * 60;

    const html = `
      <div
        class="spot-pin pin-anim"
        style="
          --pin-color:${color};
          animation-delay:${delay}ms;
        "
      >
        ${PIN_SHAPE_SVG}

        <span class="pin-icon">
          <svg viewBox="0 0 24 24">${CATEGORY_ICON_PATHS[category] || ""}</svg>
        </span>
      </div>
    `;

    const icon = L.divIcon({
      html,
      className: "spot-pin-wrapper",
      iconSize: [34, 44],
      iconAnchor: [17, 44],
      popupAnchor: [0, -38]
    });

    const marker = L.marker(latlng, { icon });

    marker.on("mouseover", () => {
      const el = marker.getElement();

      if (el) {
        el
          .querySelector(".spot-pin")
          .classList.add("pin-hover");
      }
    });

    marker.on("mouseout", () => {
      const el = marker.getElement();

      if (el) {
        el
          .querySelector(".spot-pin")
          .classList.remove("pin-hover");
      }
    });

    return marker;
  };
}

// ---- Load tourist spots ---------------------------------------------------
async function loadSpots() {
  try {
    const response = await fetch("data/spots.geojson");

    if (!response.ok) {
      throw new Error("Failed to load spots.geojson");
    }

    const geo = await response.json();

    spotsData = geo;

    Object.keys(CATEGORY_META).forEach(cat => {
      const features = geo.features.filter(
        feature =>
          feature.properties.category === cat
      );

      categoryLayers[cat] = L.geoJSON(
        {
          type: "FeatureCollection",
          features
        },
        {
          pointToLayer: markerForCategory(cat),

          onEachFeature: (feature, layer) => {
            layer.bindPopup(
              buildPopupHtml(feature.properties)
            );

            layer.on("click", () => {
              showSpotDetail(feature.properties);
            });

            markerIndex.push({
              feature,
              marker: layer,
              category: cat
            });
          }
        }
      ).addTo(map);
    });

    // Use the same 5 combined province files
    const provGeo = await loadProvinces();

    spotCountByProvince = {};

    provGeo.features.forEach(feature => {
      const province =
        feature.properties.province ||
        feature.properties.name;

      spotCountByProvince[province] = 0;
    });

    geo.features.forEach(spot => {
      const point = spot.geometry.coordinates;

      const match = provGeo.features.find(province =>
        pointInPolygonFeature(
          point,
          province.geometry
        )
      );

      if (match) {
        const province =
          match.properties.province ||
          match.properties.name;

        spotCountByProvince[province]++;
      }
    });

    refreshProvinceCounts();
    buildMapLegend();

  } catch (err) {
    console.error(
      "Failed to load spots:",
      err
    );
  }
}

// ---- Map legend -----------------------------------------------------------
function buildMapLegend() {
  const legend = L.control({
    position: "topright"
  });

  legend.onAdd = () => {
    const div = L.DomUtil.create(
      "div",
      "map-legend"
    );

    div.innerHTML = Object.entries(CATEGORY_META)
      .map(
        ([key, meta]) => `
          <div class="legend-row">
            <span
              class="legend-icon"
              style="background:${meta.color}"
            >
              <svg>
                <use href="#icon-${key}"/>
              </svg>
            </span>

            ${meta.label}
          </div>
        `
      )
      .join("");

    return div;
  };

  legend.addTo(map);
}

// ---- Category toggle ------------------------------------------------------
document
  .getElementById("categoryList")
  .addEventListener("click", e => {

    const chip =
      e.target.closest(".cat-chip");

    if (!chip) return;

    const category =
      chip.dataset.category;

    const layer =
      categoryLayers[category];

    if (!layer) return;

    const nowActive =
      !chip.classList.contains("active");

    chip.classList.toggle(
      "active",
      nowActive
    );

    chip.classList.remove("chip-pop");
    // eslint-disable-next-line no-unused-expressions
    void chip.offsetWidth; // restart the pop animation
    chip.classList.add("chip-pop");

    if (nowActive) {
      map.addLayer(layer);
    } else {
      map.removeLayer(layer);
    }
  });

// ---- Suggested routes -----------------------------------------------------
function loadRoutes() {
  fetch("data/routes.geojson")
    .then(r => r.json())
    .then(geo => {

      routeLayer = L.geoJSON(geo, {
        style: {
          color: "#e2a33a",
          weight: 4,
          dashArray: "2 10",
          lineCap: "round"
        },

        onEachFeature: (feature, layer) => {
          layer.bindPopup(`
            <div class="route-popup">
              <strong>
                ${feature.properties.route_name}
              </strong>
              <br/>
              ${feature.properties.notes}
            </div>
          `);
        }
      });

    })
    .catch(err =>
      console.error(
        "Failed to load routes:",
        err
      )
    );
}

document
  .getElementById("toggleRoutes")
  .addEventListener("click", e => {

    const btn = e.currentTarget;

    if (!routeLayer) return;

    const nowActive =
      !btn.classList.contains("active");

    btn.classList.toggle(
      "active",
      nowActive
    );

    btn.classList.remove("chip-pop");
    void btn.offsetWidth;
    btn.classList.add("chip-pop");

    if (nowActive) {
      routeLayer.addTo(map);
    } else {
      map.removeLayer(routeLayer);
    }
  });

// ---- Search ---------------------------------------------------------------
const searchBox =
  document.getElementById("searchBox");

const searchCount =
  document.getElementById("searchCount");

searchBox.addEventListener("input", () => {
  const query =
    searchBox.value
      .trim()
      .toLowerCase();

  if (!query) {
    markerIndex.forEach(({ marker }) =>
      marker.setOpacity(1)
    );

    searchCount.textContent = "";
    return;
  }

  let matches = 0;
  let firstMatch = null;

  markerIndex.forEach(
    ({ feature, marker }) => {

      const haystack = (
        feature.properties.spot_name +
        " " +
        feature.properties.municipality
      ).toLowerCase();

      const isMatch =
        haystack.includes(query);

      if (isMatch) {
        matches++;

        if (!firstMatch) {
          firstMatch = marker;
        }

        marker.setOpacity(1);

      } else {
        marker.setOpacity(0.15);
      }
    }
  );

  searchCount.textContent =
    matches === 0
      ? "No spots match."
      : `${matches} spot${matches === 1 ? "" : "s"} found`;

  if (
    matches > 0 &&
    matches <= 3 &&
    firstMatch
  ) {
    map.panTo(
      firstMatch.getLatLng()
    );
  }
});

// ---- Sidebar toggle -------------------------------------------------------
document
  .getElementById("toggleSidebar")
  .addEventListener("click", () => {

    const sidebar =
      document.getElementById("sidebar");

    sidebar.classList.toggle("collapsed");
  });

// ---- Deep link from the home page (index.html?province=Name) --------------
function focusProvinceFromQuery() {
  if (!provinceLayer) return;

  const params = new URLSearchParams(window.location.search);
  const wanted = params.get("province");

  if (!wanted) return;

  provinceLayer.eachLayer(layer => {
    const layerProvince =
      layer.feature.properties.province ||
      layer.feature.properties.name;

    if (layerProvince === wanted) {
      map.fitBounds(layer.getBounds(), { padding: [30, 30] });
    }
  });
}

// ---- Boot -----------------------------------------------------------------
Promise.all([createProvinceLayer(), loadSpots()]).then(() => {
  focusProvinceFromQuery();
});
loadRoutes();