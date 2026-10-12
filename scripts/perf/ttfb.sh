#!/bin/bash
# usage: SLUG=some-recipe bash scripts/perf/ttfb.sh BASE_URL
# For each page: the FIRST request (cold cache) and the median of 7 (warm), in
# ms, as "ttfb/total". TTFB is when the first byte arrives (with loading.tsx
# that is the skeleton shell); total is when the full page has streamed in,
# which is what a person actually waits for.
BASE=$1
for p in "/" "/recipes" "/recipes?q=chicken" "/pantry?pantry=2358,171" "/recipes/$SLUG" ; do
  a=(); b=()
  for i in 1 2 3 4 5 6 7; do
    read -r x y < <(curl -s -o /dev/null -w "%{time_starttransfer} %{time_total}\n" -H "User-Agent: perf-check" "$BASE$p")
    a+=($(awk "BEGIN{printf \"%d\", $x*1000}"))
    b+=($(awk "BEGIN{printf \"%d\", $y*1000}"))
  done
  sa=($(printf '%s\n' "${a[@]}" | sort -n))
  sb=($(printf '%s\n' "${b[@]}" | sort -n))
  echo "$p  cold=${a[0]}/${b[0]}  warm-median=${sa[3]}/${sb[3]}  (ttfb/total ms)"
done
