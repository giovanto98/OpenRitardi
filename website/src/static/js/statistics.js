/**
 * Script that handles generation of best and worst trains and stations
 */

function pascalize(str) {
    return str.replace(/\w+/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

/**
 * Given a delay in float format, returns a string that shows the minutes and seconds, example: 5.5 is converted to 5' 30'' (5 minutes, 30 seconds)
 */
function generateDelayString(delay) {
    const minutes = Math.floor(delay);
    const seconds = Math.round((delay - minutes) * 60);
    return seconds === 0 ? `${minutes}'` : `${minutes}' ${seconds}''`;
}

function trainClassToImage(train_class) {
    const trainImages = {
        "IC": window.OR_BASE + "media/intercity.svg width='80px'",
        "ICN": window.OR_BASE + "media/intercity_notte.svg width='80px'",
        "REG": window.OR_BASE + "media/RE.svg",
        "EC": window.OR_BASE + "media/EC.svg",
        "FR": window.OR_BASE + "media/frecciarossa.svg width='80px'",
        "FB": window.OR_BASE + "media/frecciabianca.svg width='80px'",
        "FA": window.OR_BASE + "media/frecciargento.svg width='80px'"
    };

    return trainImages[train_class] || window.OR_BASE + "media/logo/favicon.png";
}

const trainClicked = (train_id) => window.location.href = "trains.html?train_id=" + train_id;
const stopClicked = (stop_name) => window.location.href = "index.html?stop_name=" + stop_name;

function generateTrainHTML(trains) {
    let html = '';
    trains.forEach( (train) => {
        html += `<tr onclick="trainClicked('${train["train_id"]}')">
        <td><img src=${trainClassToImage(train["train_class"])} class="ot-train-logo ot-train-logo-ic vertical-center"> ${train["train_number"]}</td>
        <td>${pascalize(train["train_departure_stop_name"])} <span uk-icon="arrow-right"></span> ${pascalize(train["train_arrival_stop_name"])}</td>
        <td>${generateDelayString(train["avg_arrival_delay"])}</td>
        </tr>`
    });

    return html;
}

function generateStopHTML(stops) {
    let html = '';
    stops.forEach(function (stop) {
        html += `<tr onclick="stopClicked('${stop["stop_name"]}')">
        <td>${pascalize(stop["stop_name"])}</td>
        <td>${generateDelayString(stop["avg_arrival_delay"])}</td>
        <td>${stop["count_stops"]}</td>
        </tr>`
    });

    return html;
}

function generateBestWorst(data, sortProperty, generateHTML, bestElementId, worstElementId) {
    /**
     * Generates the best and worst items based on the provided criteria
     */
    const sortedData = data.sort((a, b) => a[sortProperty] - b[sortProperty]);
    const bestItems = sortedData.slice(0, 5);
    const worstItems = sortedData.slice(-5).reverse();

    document.getElementById(bestElementId).innerHTML = generateHTML(bestItems);
    document.getElementById(worstElementId).innerHTML = generateHTML(worstItems);
}

/**
 * ---- Compare years mode: trains table ----
 *
 * Joins data_train_index.csv for year A (the page's selected year) and a
 * chosen year B on train_id, showing shared trains side-by-side with a
 * delta column, plus counts of trains that only exist in one of the years.
 */
const statsCompare = { rows: [], sortKey: 'delta', sortAscending: false };

function generateCompareRow(row) {
    const deltaColor = window.OR_Compare.deltaColormap(row.delta);
    const sign = row.delta >= 0 ? '+' : '-';
    return `<tr onclick="trainClicked('${row.train_id}')">
        <td><img src=${trainClassToImage(row.train_class)} class="ot-train-logo ot-train-logo-ic vertical-center"> ${row.train_number}</td>
        <td>${pascalize(row.train_departure_stop_name)} <span uk-icon="arrow-right"></span> ${pascalize(row.train_arrival_stop_name)}</td>
        <td>${generateDelayString(row.delayA)}</td>
        <td>${generateDelayString(row.delayB)}</td>
        <td><span style="color: ${deltaColor}">${sign}${generateDelayString(Math.abs(row.delta))}</span></td>
        </tr>`;
}

function renderCompareTable() {
    const tbody = document.getElementById('stats-compare-table-body');
    const sorted = statsCompare.rows.slice().sort((a, b) => {
        const diff = a[statsCompare.sortKey] - b[statsCompare.sortKey];
        return statsCompare.sortAscending ? diff : -diff;
    });
    tbody.innerHTML = sorted.map(generateCompareRow).join('');
}

function attachStatsCompareSortHandlers() {
    document.querySelectorAll('.stats-compare-sortable').forEach((th) => {
        th.addEventListener('click', () => {
            const key = th.getAttribute('data-sort-key');
            if (key === statsCompare.sortKey) {
                statsCompare.sortAscending = !statsCompare.sortAscending;
            } else {
                statsCompare.sortKey = key;
                statsCompare.sortAscending = false;
            }
            renderCompareTable();
        });
    });
}

function loadStatsCompareData(trainDataA, yearA, yearB) {
    return d3.csv(window.OR_BASE + "data/" + yearB + "/data_train_index.csv").then((trainDataB) => {
        const joined = window.OR_Compare.joinByKey(trainDataA, trainDataB, 'train_id');

        statsCompare.rows = joined.shared.map((pair) => {
            const delayA = Number(pair.a.avg_arrival_delay);
            const delayB = Number(pair.b.avg_arrival_delay);
            return {
                train_id: pair.key,
                train_class: pair.a.train_class,
                train_number: pair.a.train_number,
                train_departure_stop_name: pair.a.train_departure_stop_name,
                train_arrival_stop_name: pair.a.train_arrival_stop_name,
                delayA: delayA,
                delayB: delayB,
                delta: delayB - delayA
            };
        });

        document.querySelector('.or-compare-year-a-label').textContent = yearA;
        document.querySelector('.or-compare-year-b-label').textContent = yearB;

        const summaryEl = document.getElementById('stats-compare-summary');
        const onlyPrefix = summaryEl.getAttribute('data-only-in-prefix') || 'Only in';
        summaryEl.textContent = `${onlyPrefix} ${yearA}: ${joined.onlyA.length} · ${onlyPrefix} ${yearB}: ${joined.onlyB.length}`;
        summaryEl.style.display = 'block';

        document.getElementById('stats-compare-table-container').style.display = 'block';
        renderCompareTable();
    });
}

function exitStatsCompareMode() {
    document.getElementById('stats-compare-summary').style.display = 'none';
    document.getElementById('stats-compare-table-container').style.display = 'none';
}

function setupStatsCompareControls(train_data, years, yearA) {
    const toggle = document.getElementById('stats-compare-toggle');
    const containerB = document.getElementById('stats-compare-year-b-container');
    const mountB = document.querySelector('#stats-compare-year-b-container .or-compare-year-b-mount');
    if (!toggle || !mountB) return;

    const otherYears = (years || []).slice()
        .filter((y) => String(y.year) !== String(yearA))
        .sort((a, b) => Number(b.year) - Number(a.year));

    if (otherYears.length === 0) {
        toggle.disabled = true;
        return;
    }

    const select = document.createElement('select');
    select.className = 'uk-select uk-select-small';
    select.id = 'stats-compare-year-b-select';
    otherYears.forEach((y) => {
        const opt = document.createElement('option');
        opt.value = y.year;
        opt.textContent = y.year;
        select.appendChild(opt);
    });
    mountB.innerHTML = '';
    mountB.appendChild(select);

    const urlCompareYear = window.OR_Compare.readCompareYearFromUrl();
    const validUrlYear = urlCompareYear && otherYears.some((y) => String(y.year) === urlCompareYear);
    select.value = validUrlYear ? urlCompareYear : String(otherYears[0].year);

    function activate() {
        containerB.style.display = 'inline';
        window.OR_Compare.setCompareYearInUrl(select.value);
        loadStatsCompareData(train_data, yearA, select.value).then(attachStatsCompareSortHandlers);
    }
    function deactivate() {
        containerB.style.display = 'none';
        window.OR_Compare.setCompareYearInUrl(null);
        exitStatsCompareMode();
    }

    toggle.addEventListener('change', () => {
        if (toggle.checked) activate(); else deactivate();
    });
    select.addEventListener('change', () => {
        if (toggle.checked) activate();
    });

    if (validUrlYear) {
        toggle.checked = true;
        activate();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const state = await window.OR_YEAR_READY;
    const train_data = await d3.csv(window.OR_BASE + "data/" + window.OR_YEAR + "/data_train_index.csv");
    const stop_data = await d3.csv(window.OR_BASE + "data/" + window.OR_YEAR + "/data_stop.csv");

    generateBestWorst(train_data, 'median_arrival_delay', generateTrainHTML, 'best-trains', 'worst-trains');

    // filter out stops with less than 1200 trains
    const stop_data_filtered = stop_data.filter((stop) => stop["count_stops"] > 1200);
    generateBestWorst(stop_data_filtered, 'avg_arrival_delay', generateStopHTML, 'best-stops', 'worst-stops');

    setupStatsCompareControls(train_data, state.years, state.year);
});
