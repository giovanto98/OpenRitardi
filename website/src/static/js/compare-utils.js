/**
 * Small shared helpers for "Compare years" mode, used by both the stations
 * map (stations_map_mapbox.js, homepage) and the trains table
 * (statistics.js, statistics page). Loaded after d3.
 */
(function () {
    "use strict";

    function readCompareYearFromUrl() {
        var params = new URLSearchParams(window.location.search);
        return params.get("compare");
    }

    function setCompareYearInUrl(year) {
        var url = new URL(window.location.href);
        if (year) {
            url.searchParams.set("compare", year);
        } else {
            url.searchParams.delete("compare");
        }
        window.history.replaceState({}, "", url.toString());
    }

    // Diverging colormap for a delta (year B minus year A): negative delta
    // (delay went down = improvement) reads blue, positive delta (delay went
    // up = regression) reads red -- matching the site's existing red-for-bad
    // convention used by the absolute-delay colormap elsewhere.
    var deltaColormap = d3.scaleLinear()
        .domain([-5, 0, 5])
        .range(['#1e87f0', '#d8d8d8', '#e81710'])
        .clamp(true);

    // Marker/text colour for items present in only one of the two years
    // being compared (no delta can be computed for them).
    var NEUTRAL_COLOR = '#9e9e9e';

    /**
     * Joins two arrays of row objects on `key`, returning:
     *   - shared: [{ key, a, b }, ...] for keys present in both
     *   - onlyA:  rows from itemsA whose key has no match in itemsB
     *   - onlyB:  rows from itemsB whose key has no match in itemsA
     */
    function joinByKey(itemsA, itemsB, key) {
        var byKeyB = {};
        (itemsB || []).forEach(function (item) { byKeyB[item[key]] = item; });

        var shared = [];
        var onlyA = [];
        var seenB = {};

        (itemsA || []).forEach(function (a) {
            var b = byKeyB[a[key]];
            if (b) {
                shared.push({ key: a[key], a: a, b: b });
                seenB[a[key]] = true;
            } else {
                onlyA.push(a);
            }
        });

        var onlyB = (itemsB || []).filter(function (b) { return !seenB[b[key]]; });

        return { shared: shared, onlyA: onlyA, onlyB: onlyB };
    }

    window.OR_Compare = {
        readCompareYearFromUrl: readCompareYearFromUrl,
        setCompareYearInUrl: setCompareYearInUrl,
        deltaColormap: deltaColormap,
        NEUTRAL_COLOR: NEUTRAL_COLOR,
        joinByKey: joinByKey
    };
})();
