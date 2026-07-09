/**
 * Reliability ("Affidabilità") page: cancelled + rescheduled trains, for the
 * selected year.
 *
 * Reads three per-year CSVs (contract owned by the data pipeline, see
 * prepare_data.sh):
 *   - cancellations_monthly.csv:    month(YYYY-MM), n_trains, n_cancelled, n_rescheduled, perc_cancelled, perc_rescheduled
 *   - cancellations_by_class.csv:   train_class, n_trains, n_cancelled, n_rescheduled, perc_cancelled, perc_rescheduled
 *   - cancellations_top_routes.csv: train_class, train_number, departure, arrival, n_days_planned, n_cancelled, perc_cancelled
 *
 * Older per-year datasets (produced before this page existed) may not have
 * these files -- in that case the page shows an empty-state message instead
 * of a broken/blank page.
 */

function pascalize(str) {
    return String(str).replace(/\w+/g, function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
}

function formatPercent(fraction) {
    var n = Number(fraction);
    if (isNaN(n)) return '-';
    return Math.round(n * 1000) / 10 + '%';
}

/**
 * Fetches a CSV, resolving to `null` (rather than rejecting) when the file
 * is missing (404) or otherwise unreachable, so callers can render a
 * graceful empty state instead of crashing.
 */
function tryFetchCsv(url) {
    return fetch(url)
        .then(function (response) { return response.ok ? response.text() : null; })
        .then(function (text) { return text ? d3.csvParse(text) : null; })
        .catch(function () { return null; });
}

function generateByClassRow(row) {
    return '<tr>' +
        '<td>' + row.train_class + '</td>' +
        '<td>' + row.n_trains + '</td>' +
        '<td>' + row.n_cancelled + '</td>' +
        '<td>' + row.n_rescheduled + '</td>' +
        '<td>' + formatPercent(row.perc_cancelled) + '</td>' +
        '<td>' + formatPercent(row.perc_rescheduled) + '</td>' +
        '</tr>';
}

function generateTopRouteRow(row) {
    return '<tr>' +
        '<td>' + row.train_class + '</td>' +
        '<td>' + row.train_number + '</td>' +
        '<td>' + pascalize(row.departure) + ' <span uk-icon="arrow-right"></span> ' + pascalize(row.arrival) + '</td>' +
        '<td>' + row.n_days_planned + '</td>' +
        '<td>' + row.n_cancelled + '</td>' +
        '<td>' + formatPercent(row.perc_cancelled) + '</td>' +
        '</tr>';
}

/**
 * Generic sortable-table wiring: clicking a `.<sortableClass>` header
 * re-sorts `rows` (numerically, on the column's `data-sort-key`) and
 * re-renders `tbodyId` via `generateRowHtml`. Ascending/descending toggles
 * on repeated clicks of the same column, same convention as notte.js.
 */
function makeSortableTable(sortableClass, tbodyId, rows, generateRowHtml, defaultSortKey) {
    var state = { key: defaultSortKey, ascending: false };

    function render() {
        var tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        var sorted = rows.slice().sort(function (a, b) {
            var diff = Number(a[state.key]) - Number(b[state.key]);
            return state.ascending ? diff : -diff;
        });
        tbody.innerHTML = sorted.map(generateRowHtml).join('');
    }

    document.querySelectorAll('.' + sortableClass).forEach(function (th) {
        th.addEventListener('click', function () {
            var key = th.getAttribute('data-sort-key');
            if (key === state.key) {
                state.ascending = !state.ascending;
            } else {
                state.key = key;
                state.ascending = false;
            }
            render();
        });
    });

    render();
}

function renderTiles(monthly) {
    var totalTrains = d3.sum(monthly, function (d) { return +d.n_trains; });
    var totalCancelled = d3.sum(monthly, function (d) { return +d.n_cancelled; });
    var totalRescheduled = d3.sum(monthly, function (d) { return +d.n_rescheduled; });

    document.getElementById('affidabilita-tile-n-trains').textContent = totalTrains;
    document.getElementById('affidabilita-tile-perc-cancelled').textContent =
        totalTrains > 0 ? formatPercent(totalCancelled / totalTrains) : '-';
    document.getElementById('affidabilita-tile-perc-rescheduled').textContent =
        totalTrains > 0 ? formatPercent(totalRescheduled / totalTrains) : '-';
}

function renderMonthlyChart(monthly) {
    var container = document.getElementById('affidabilita-monthly-chart');
    container.innerHTML = '';

    var data = monthly.slice().sort(function (a, b) { return a.month.localeCompare(b.month); });

    var width = container.clientWidth || 600;
    var height = 340;
    var margin = { top: 24, right: 20, bottom: 44, left: 48 };

    var svg = d3.select(container).append('svg')
        .attr('width', '100%')
        .attr('viewBox', '0 0 ' + width + ' ' + height)
        .attr('preserveAspectRatio', 'xMinYMin meet');

    var x0 = d3.scaleBand()
        .domain(data.map(function (d) { return d.month; }))
        .range([margin.left, width - margin.right])
        .paddingInner(0.3);

    var x1 = d3.scaleBand()
        .domain(['perc_cancelled', 'perc_rescheduled'])
        .range([0, x0.bandwidth()])
        .padding(0.15);

    var maxValue = d3.max(data, function (d) {
        return Math.max(+d.perc_cancelled, +d.perc_rescheduled);
    }) || 0.05;

    var y = d3.scaleLinear()
        .domain([0, maxValue * 1.25])
        .nice()
        .range([height - margin.bottom, margin.top]);

    var color = { perc_cancelled: '#e81710', perc_rescheduled: '#f2a413' };
    var seriesLabel = {
        perc_cancelled: (document.documentElement.lang || '').toLowerCase().startsWith('it') ? 'Cancellati' : 'Cancelled',
        perc_rescheduled: (document.documentElement.lang || '').toLowerCase().startsWith('it') ? 'Reinstradati' : 'Rescheduled'
    };

    svg.append('g')
        .attr('transform', 'translate(0,' + (height - margin.bottom) + ')')
        .call(d3.axisBottom(x0))
        .selectAll('text')
        .attr('transform', 'rotate(-35)')
        .style('text-anchor', 'end');

    svg.append('g')
        .attr('transform', 'translate(' + margin.left + ',0)')
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.0%')));

    var monthGroups = svg.selectAll('.affidabilita-month-group')
        .data(data)
        .enter()
        .append('g')
        .attr('class', 'affidabilita-month-group')
        .attr('transform', function (d) { return 'translate(' + x0(d.month) + ',0)'; });

    monthGroups.selectAll('rect')
        .data(function (d) {
            return ['perc_cancelled', 'perc_rescheduled'].map(function (key) {
                return { key: key, value: +d[key], month: d.month };
            });
        })
        .enter()
        .append('rect')
        .attr('x', function (d) { return x1(d.key); })
        .attr('y', function (d) { return y(d.value); })
        .attr('width', x1.bandwidth())
        .attr('height', function (d) { return y(0) - y(d.value); })
        .attr('fill', function (d) { return color[d.key]; })
        .append('title')
        .text(function (d) { return d.month + ' - ' + seriesLabel[d.key] + ': ' + formatPercent(d.value); });

    // simple legend
    var legend = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + 6 + ')');
    ['perc_cancelled', 'perc_rescheduled'].forEach(function (key, i) {
        var g = legend.append('g').attr('transform', 'translate(' + (i * 140) + ',0)');
        g.append('rect').attr('width', 12).attr('height', 12).attr('fill', color[key]);
        g.append('text').attr('x', 18).attr('y', 10).style('font-size', '12px').text(seriesLabel[key]);
    });
}

function showEmptyState() {
    document.getElementById('affidabilita-empty-state').style.display = 'block';
    document.getElementById('affidabilita-content').style.display = 'none';
}

function showContent() {
    document.getElementById('affidabilita-empty-state').style.display = 'none';
    document.getElementById('affidabilita-content').style.display = 'block';
}

document.addEventListener('DOMContentLoaded', function () {
    window.OR_YEAR_READY.then(function () {
        var base = window.OR_BASE + 'data/' + window.OR_YEAR + '/';

        Promise.all([
            tryFetchCsv(base + 'cancellations_monthly.csv'),
            tryFetchCsv(base + 'cancellations_by_class.csv'),
            tryFetchCsv(base + 'cancellations_top_routes.csv')
        ]).then(function (results) {
            var monthly = results[0];
            var byClass = results[1];
            var topRoutes = results[2];

            if (!monthly || monthly.length === 0) {
                showEmptyState();
                return;
            }

            showContent();

            renderTiles(monthly);
            renderMonthlyChart(monthly);

            makeSortableTable('affidabilita-sortable-class', 'affidabilita-by-class-table-body',
                byClass || [], generateByClassRow, 'perc_cancelled');
            makeSortableTable('affidabilita-sortable-routes', 'affidabilita-top-routes-table-body',
                topRoutes || [], generateTopRouteRow, 'perc_cancelled');
        });
    });
});
