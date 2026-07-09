#!/usr/bin/env bash
# Unzips the generated dataset(s) into website/dist/data, ready to be served
# by the Eleventy build (or any static file server) under a year-scoped layout:
#
#   website/dist/data/years.json        <- [{year, days_covered, complete, n_trains, n_stations, generated_at}, ...]
#   website/dist/data/<year>/data_stop.csv
#   website/dist/data/<year>/data_stop_region.csv
#   website/dist/data/<year>/data_train_index.csv
#   website/dist/data/<year>/trains/<train_id>.csv
#   website/dist/data/<year>/trains_shapes/<train_id>.csv
#   website/dist/data/<year>/cancellations_monthly.csv      (optional, Reliability page)
#   website/dist/data/<year>/cancellations_by_class.csv     (optional, Reliability page)
#   website/dist/data/<year>/cancellations_top_routes.csv   (optional, Reliability page)
#
# The three cancellations_*.csv files are produced unzipped by the DuckDB
# pipeline, sitting directly in data/dataset_generated_duckdb/<year>/
# alongside the zips (not inside any of the zips above). They are optional:
# older per-year datasets may not have them yet, in which case they're simply
# not copied and the Reliability page renders its empty state for that year.
#
# Two source layouts are supported:
#
# 1. Multi-year (preferred, drop-in): one folder per year under
#    data/dataset_generated_duckdb/<year>/, each containing the same zip
#    filenames as the legacy single-year dataset below, plus a sibling
#    data/dataset_generated_duckdb/years.json manifest. When this layout is
#    present, every year folder found is unzipped into
#    website/dist/data/<year>/ and years.json is copied verbatim -- no code
#    changes needed on either side (this script or the front-end JS) once
#    those folders + manifest exist.
#
# 2. Legacy single-year fallback: data/dataset_generated/*.zip (today's only
#    dataset, 2024). Used automatically when no
#    data/dataset_generated_duckdb/<year>/ folder exists yet. Unzipped into
#    website/dist/data/2024/, and a synthetic years.json (single complete
#    2024 entry) is generated so the front-end year picker has the same
#    contract to read regardless of which layout produced the data.
set -euo pipefail

DUCKDB_ROOT="data/dataset_generated_duckdb"
DIST_DATA="website/dist/data"

# unzip the 5 known artifacts for one "dataset root" (a folder containing the
# same zip layout as data/dataset_generated) into website/dist/data/<year>
unzip_year_dataset() {
  local src_root="$1"
  local year="$2"
  local out="${DIST_DATA}/${year}"

  mkdir -p "${out}"

  if [ -f "${src_root}/data_stop_region.zip" ]; then
    unzip -o -j "${src_root}/data_stop_region.zip" -d "${out}"
  else
    echo "prepare_data.sh: WARNING missing ${src_root}/data_stop_region.zip (year ${year})" >&2
  fi

  if [ -f "${src_root}/data_stop.zip" ]; then
    unzip -o -j "${src_root}/data_stop.zip" -d "${out}"
  else
    echo "prepare_data.sh: WARNING missing ${src_root}/data_stop.zip (year ${year})" >&2
  fi

  if [ -f "${src_root}/data_train_index.zip" ]; then
    unzip -o -j "${src_root}/data_train_index.zip" -d "${out}"
  else
    echo "prepare_data.sh: WARNING missing ${src_root}/data_train_index.zip (year ${year})" >&2
  fi

  mkdir -p "${out}/trains"
  if [ -f "${src_root}/data_train_stat/data_train_stat.zip" ]; then
    unzip -o -j "${src_root}/data_train_stat/data_train_stat.zip" -d "${out}/trains"
  else
    echo "prepare_data.sh: WARNING missing ${src_root}/data_train_stat/data_train_stat.zip (year ${year})" >&2
  fi

  mkdir -p "${out}/trains_shapes"
  if [ -f "${src_root}/trains_shapes.zip" ]; then
    unzip -o -j "${src_root}/trains_shapes.zip" -d "${out}/trains_shapes"
  else
    echo "prepare_data.sh: WARNING missing ${src_root}/trains_shapes.zip (year ${year})" >&2
  fi

  copy_cancellation_csvs "${src_root}" "${out}" "${year}"
}

# Copies the (optional) cancellations_*.csv trio straight across -- they
# arrive unzipped from the DuckDB pipeline, so no unzip step is needed.
# Missing files are not an error: the Reliability page degrades gracefully
# to an empty state when they're absent for a given year.
copy_cancellation_csvs() {
  local src_root="$1"
  local out="$2"
  local year="$3"
  local found=0

  for f in cancellations_monthly.csv cancellations_by_class.csv cancellations_top_routes.csv; do
    if [ -f "${src_root}/${f}" ]; then
      cp "${src_root}/${f}" "${out}/${f}"
      found=1
    fi
  done

  if [ "${found}" -eq 0 ]; then
    echo "prepare_data.sh: no cancellations_*.csv found in ${src_root} (year ${year}) -- Reliability page will show its empty state for this year" >&2
  fi
}

mkdir -p "${DIST_DATA}"

if [ -d "${DUCKDB_ROOT}" ] && find "${DUCKDB_ROOT}" -mindepth 1 -maxdepth 1 -type d | grep -q .; then
  echo "prepare_data.sh: multi-year layout detected under ${DUCKDB_ROOT}/"

  for yeardir in "${DUCKDB_ROOT}"/*/; do
    year="$(basename "${yeardir%/}")"
    echo "prepare_data.sh: unzipping year ${year} -> ${DIST_DATA}/${year}/"
    unzip_year_dataset "${yeardir%/}" "${year}"
  done

  if [ -f "${DUCKDB_ROOT}/years.json" ]; then
    cp "${DUCKDB_ROOT}/years.json" "${DIST_DATA}/years.json"
  else
    echo "prepare_data.sh: WARNING ${DUCKDB_ROOT}/years.json not found -- front-end year picker will have no manifest" >&2
  fi
else
  echo "prepare_data.sh: no ${DUCKDB_ROOT}/<year>/ folders found -- falling back to legacy single-year 2024 dataset"

  LEGACY_ROOT="data/dataset_generated"
  YEAR="2024"
  unzip_year_dataset "${LEGACY_ROOT}" "${YEAR}"

  # Synthesize a years.json manifest so the front-end always has the same
  # contract to read, whether the data came from the legacy single-year
  # fallback or the real multi-year DuckDB pipeline.
  n_trains=0
  n_stations=0
  if [ -f "${DIST_DATA}/${YEAR}/data_train_index.csv" ]; then
    n_trains=$(($(wc -l < "${DIST_DATA}/${YEAR}/data_train_index.csv") - 1))
  fi
  if [ -f "${DIST_DATA}/${YEAR}/data_stop.csv" ]; then
    n_stations=$(($(wc -l < "${DIST_DATA}/${YEAR}/data_stop.csv") - 1))
  fi
  generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  cat > "${DIST_DATA}/years.json" <<EOF
[
  {
    "year": ${YEAR},
    "days_covered": 366,
    "complete": true,
    "n_trains": ${n_trains},
    "n_stations": ${n_stations},
    "generated_at": "${generated_at}"
  }
]
EOF
fi

echo "prepare_data.sh: done"
