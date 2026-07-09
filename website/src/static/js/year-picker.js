/**
 * Year picker.
 *
 * Resolves which dataset year the page should use, from (in priority order):
 *   1. ?year=YYYY URL parameter
 *   2. localStorage (last choice made on this device)
 *   3. the latest "complete" year in data/years.json
 *   4. a hardcoded "2024" fallback (if years.json is missing/unreachable)
 *
 * and exposes the result as:
 *   - window.OR_YEAR_READY : a Promise resolving to { year, years } as soon as
 *     the choice is known. Every data-loading script on the page should
 *     `await window.OR_YEAR_READY` (or `.then(...)`) before building any
 *     "data/<year>/..." URL, so there is no race between this script's
 *     years.json fetch and the rest of the page's own data fetches.
 *   - window.OR_YEAR : the resolved year (string), set as soon as
 *     OR_YEAR_READY resolves. Safe to read synchronously in code that only
 *     runs after OR_YEAR_READY has resolved (e.g. click handlers wired up
 *     after the initial page load).
 *
 * This script is loaded very early in <head> (right after window.OR_BASE is
 * set) so the years.json fetch starts as soon as possible.
 */
(function () {
    "use strict";

    var YEARS_URL = window.OR_BASE + "data/years.json";
    var STORAGE_KEY = "or_selected_year";
    var FALLBACK_YEAR = "2024";

    function readUrlYear() {
        var params = new URLSearchParams(window.location.search);
        return params.get("year");
    }

    function readStoredYear() {
        try {
            return window.localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            return null;
        }
    }

    function storeYear(year) {
        try {
            window.localStorage.setItem(STORAGE_KEY, year);
        } catch (e) {
            // localStorage unavailable (private mode, etc.) -- not fatal
        }
    }

    function pickDefaultYear(years) {
        if (!years || years.length === 0) {
            return FALLBACK_YEAR;
        }
        var complete = years.filter(function (y) { return y.complete; });
        var pool = complete.length > 0 ? complete : years;
        var best = pool.reduce(function (a, b) {
            return Number(b.year) > Number(a.year) ? b : a;
        });
        return String(best.year);
    }

    /**
     * Approximates the "Jan-Apr" style label for an incomplete year, from
     * days_covered (assumes coverage starts on Jan 1st of that year, which
     * matches how the dataset is generated).
     */
    function coverageLabel(year, daysCovered) {
        var lang = (document.documentElement.lang || "").toLowerCase().startsWith("it") ? "it-IT" : "en-GB";
        var fmt = new Intl.DateTimeFormat(lang, { month: "short" });
        var start = new Date(Date.UTC(Number(year), 0, 1));
        var dayOffset = Math.max(1, Number(daysCovered) || 1);
        var end = new Date(Date.UTC(Number(year), 0, dayOffset));
        var startLabel = fmt.format(start);
        var endLabel = fmt.format(end);
        return startLabel === endLabel ? startLabel : (startLabel + "–" + endLabel);
    }

    function yearOptionLabel(y) {
        if (y.complete) {
            return String(y.year);
        }
        return y.year + " (" + coverageLabel(y.year, y.days_covered) + ")";
    }

    // Kick off resolution immediately (module load time), so it runs in
    // parallel with the rest of <head> parsing.
    window.OR_YEAR_READY = (function resolveYear() {
        return fetch(YEARS_URL)
            .then(function (response) { return response.ok ? response.json() : []; })
            .catch(function () { return []; })
            .then(function (years) {
                years = Array.isArray(years) ? years : [];
                var known = years.map(function (y) { return String(y.year); });

                var urlYear = readUrlYear();
                var storedYear = readStoredYear();

                var selected;
                if (urlYear && (known.length === 0 || known.indexOf(urlYear) !== -1)) {
                    selected = urlYear;
                } else if (storedYear && (known.length === 0 || known.indexOf(storedYear) !== -1)) {
                    selected = storedYear;
                } else {
                    selected = pickDefaultYear(years);
                }

                storeYear(selected);
                window.OR_YEAR = selected;

                return { year: selected, years: years };
            });
    })();

    function setYearAndReload(year) {
        storeYear(year);
        var url = new URL(window.location.href);
        url.searchParams.set("year", year);
        window.location.href = url.toString();
    }

    function renderPickers(state) {
        var mounts = document.querySelectorAll(".or-year-picker-mount");
        if (mounts.length === 0) {
            return;
        }

        var years = (state.years || []).slice().sort(function (a, b) {
            return Number(b.year) - Number(a.year);
        });
        if (years.length === 0) {
            years = [{ year: state.year, complete: true }];
        }

        mounts.forEach(function (mount) {
            var select = document.createElement("select");
            select.className = "uk-select or-year-select";
            select.setAttribute("aria-label", "Year");

            years.forEach(function (y) {
                var option = document.createElement("option");
                option.value = y.year;
                option.textContent = yearOptionLabel(y);
                if (String(y.year) === String(state.year)) {
                    option.selected = true;
                }
                select.appendChild(option);
            });

            select.addEventListener("change", function () {
                setYearAndReload(select.value);
            });

            mount.innerHTML = "";
            mount.appendChild(select);
        });
    }

    document.addEventListener("DOMContentLoaded", function () {
        window.OR_YEAR_READY.then(renderPickers);
    });
})();
