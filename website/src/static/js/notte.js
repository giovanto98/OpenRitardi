/**
 * Intercity Notte (ICN) focus page: headline tiles, sortable train table
 * and a route map colored by delay, for the ICN service class of the
 * selected year.
 */

function pascalize(str) {
    return str.replace(/\w+/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function generateDelayString(delay) {
    const minutes = Math.floor(delay);
    const seconds = Math.round((delay - minutes) * 60);
    return seconds === 0 ? `${minutes}'` : `${minutes}' ${seconds}''`;
}

const trainClicked = (train_id) => window.location.href = "trains.html?train_id=" + train_id;

// same colormap used across the site (green -> yellow -> red)
let colormap = d3.scaleLinear()
    .domain([-10, 0, 5, 10])
    .range(['#10ad0a', '#10ad0a', '#f7f414', '#e81710']);

let icnTrains = [];
let sortKey = 'avg_arrival_delay';
let sortAscending = false;

function renderTiles(trains) {
    document.getElementById('notte-tile-n-trains').textContent = trains.length;

    if (trains.length === 0) {
        document.getElementById('notte-tile-avg-delay').textContent = '-';
        document.getElementById('notte-tile-perc-10m').textContent = '-';
        return;
    }

    const avgDelay = d3.mean(trains, d => Number(d.avg_arrival_delay));
    const percOver10 = d3.mean(trains, d => Number(d.perc_10m_delay)) * 100;

    document.getElementById('notte-tile-avg-delay').innerHTML =
        `<span style="color: ${colormap(avgDelay)}">${generateDelayString(avgDelay)}</span>`;
    document.getElementById('notte-tile-perc-10m').textContent = Math.round(percOver10) + '%';
}

function renderTable(trains) {
    const tbody = document.getElementById('notte-trains-table-body');

    if (trains.length === 0) {
        const message = tbody.getAttribute('data-no-data-message') || 'No ICN trains found for this year.';
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center">${message}</td></tr>`;
        return;
    }

    const sorted = trains.slice().sort((a, b) => {
        const diff = Number(a[sortKey]) - Number(b[sortKey]);
        return sortAscending ? diff : -diff;
    });

    let html = '';
    sorted.forEach((train) => {
        html += `<tr onclick="trainClicked('${train['train_id']}')">
            <td>${train['train_number']}</td>
            <td>${pascalize(train['train_departure_stop_name'])} <span uk-icon="arrow-right"></span> ${pascalize(train['train_arrival_stop_name'])}</td>
            <td><span style="color: ${colormap(train['avg_arrival_delay'])}">${generateDelayString(train['avg_arrival_delay'])}</span></td>
            <td>${Math.round(Number(train['perc_10m_delay']) * 100)}%</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function attachSortHandlers(trains) {
    document.querySelectorAll('.notte-sortable').forEach((th) => {
        th.addEventListener('click', () => {
            const key = th.getAttribute('data-sort-key');
            if (key === sortKey) {
                sortAscending = !sortAscending;
            } else {
                sortKey = key;
                sortAscending = true;
            }
            renderTable(trains);
        });
    });
}

// ---- Map: one route per ICN train, colored by that train's avg delay ----

let mapBoxAccessToken = "pk.eyJ1IjoiZ2lhY29tb29yc2kiLCJhIjoiY2pubTM0Nml6MW02MDNwcWY0ajc3ZHE3diJ9.fz0p1ZmseERTYVzXJPqS0Q"
mapboxgl.accessToken = mapBoxAccessToken;

const icnMap = new mapboxgl.Map({
    container: 'icn-route-map',
    style: 'https://maps.geops.io/styles/base_bright_v2/style.json?key=5cc87b12d7c5370001c1d6552688c8395e0e4e94a4faf2368b9915dd',
    center: [12.5, 42],
    zoom: 5,
});

let icnMapLoaded = false;
icnMap.on('load', function () {
    icnMapLoaded = true;
});

function plotIcnRoutes(trains, shapesByTrainId) {
    if (!icnMapLoaded) {
        setTimeout(function () { plotIcnRoutes(trains, shapesByTrainId); }, 200);
        return;
    }

    const features = trains
        .filter(train => shapesByTrainId[train['train_id']] && shapesByTrainId[train['train_id']].length > 0)
        .map(train => {
            const shape = shapesByTrainId[train['train_id']];
            return {
                type: 'Feature',
                properties: {
                    train_id: train['train_id'],
                    train_number: train['train_number'],
                    avg_arrival_delay: train['avg_arrival_delay'],
                    color: colormap(train['avg_arrival_delay'])
                },
                geometry: {
                    type: 'LineString',
                    coordinates: shape.map(p => [Number(p.shape_pt_lon), Number(p.shape_pt_lat)])
                }
            };
        });

    if (icnMap.getLayer('icn-routes')) {
        icnMap.removeLayer('icn-routes');
    }
    if (icnMap.getSource('icn-routes')) {
        icnMap.removeSource('icn-routes');
    }

    icnMap.addSource('icn-routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: features }
    });

    icnMap.addLayer({
        id: 'icn-routes',
        type: 'line',
        source: 'icn-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
            'line-color': ['get', 'color'],
            'line-width': 3,
            'line-opacity': 0.85
        }
    });

    let popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });

    icnMap.on('mousemove', 'icn-routes', (e) => {
        if (e.features.length === 0) return;
        icnMap.getCanvas().style.cursor = 'pointer';
        const p = e.features[0].properties;
        const html = `<div class="uk-text-lead" style="width:220px"><b>ICN ${p.train_number}</b><br/>` +
            `Avg Arrival Delay: <span style="color:${colormap(p.avg_arrival_delay)}">${generateDelayString(Number(p.avg_arrival_delay))}</span></div>`;
        popup.setLngLat(e.lngLat).setHTML(html).setMaxWidth("260px").addTo(icnMap);
    });

    icnMap.on('mouseleave', 'icn-routes', () => {
        icnMap.getCanvas().style.cursor = '';
        popup.remove();
    });

    if (features.length > 0) {
        const allCoords = features.flatMap(f => f.geometry.coordinates);
        const lons = allCoords.map(c => c[0]);
        const lats = allCoords.map(c => c[1]);
        icnMap.fitBounds(
            [[d3.min(lons), d3.min(lats)], [d3.max(lons), d3.max(lats)]],
            { padding: 30 }
        );
    }

    // legend (reuses the site-wide Legend() helper from legend.js)
    const legend = Legend(colormap.range(colormap.range().slice(1)).domain(colormap.domain().slice(1)), {
        title: "Average delay (min)",
    });
    d3.select("#icn-legend").html('').append("div").html(legend.outerHTML);
}

document.addEventListener('DOMContentLoaded', async () => {
    await window.OR_YEAR_READY;

    const allTrains = await d3.csv(window.OR_BASE + "data/" + window.OR_YEAR + "/data_train_index.csv");
    icnTrains = allTrains.filter(t => t['train_class'] === 'ICN');

    renderTiles(icnTrains);
    renderTable(icnTrains);
    attachSortHandlers(icnTrains);

    // fetch each ICN train's shape (small per-train CSVs, already produced by
    // the pipeline for the per-train route map on trains.html)
    const shapeEntries = await Promise.all(icnTrains.map(async (train) => {
        try {
            const shape = await d3.csv(window.OR_BASE + "data/" + window.OR_YEAR + "/trains_shapes/" + train['train_id'] + ".csv");
            return [train['train_id'], shape];
        } catch (e) {
            return [train['train_id'], []];
        }
    }));
    const shapesByTrainId = Object.fromEntries(shapeEntries);

    plotIcnRoutes(icnTrains, shapesByTrainId);
});
