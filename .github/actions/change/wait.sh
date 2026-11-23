#!/usr/bin/env bash
# Wait for markers in this run, read from its jobs (never an artifact: vendor storage the quota can
# close), as the latest execution of each job: a rerun's earlier pass or fail counts for nothing.
# `passed-<member>` is set once the member's `test`/`library` leg finishes its `passed` step;
# `published-<member>` once its `publish` job concludes success. Fails once the leg has finished
# without it, or after 25 min.
# Usage: wait.sh <dir> <marker...>   (dir is unused; Actions only, with GH_TOKEN able to read
# this run's jobs)
. "$(dirname "$0")/lib.sh"
need GITHUB_REPOSITORY GITHUB_RUN_ID GH_TOKEN
api=repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID
deadline=$((SECONDS + 1500))
# Each leg's state under its marker: passed, failed (the job itself concluded other than success)
# or running. A job reads completed before its steps' conclusions do, so a completed-with-success
# test leg with no visible `passed` yet is still running, never failed.
state() {
  gh api --paginate "$api/jobs?per_page=100&filter=latest" --jq '.jobs[] | {name: (.name | sub("^[^ ]+ / "; "")),
      done: (.status == "completed"), conclusion, passed: any(.steps[]?; .name == "passed" and .conclusion == "success")}' |
    jq -r --arg m "$1" 'select(.name | test("^(test|library|publish) "))
      | (.name | capture("^(?<k>test|library|publish) (?<n>.+)$")) as $c
      | select((($c.k | if . == "publish" then "published-" else "passed-" end) + ($c.n | gsub("[^A-Za-z0-9._-]"; "_"))) == $m)
      | if ($c.k == "publish" and .done and .conclusion == "success") or ($c.k != "publish" and .passed) then "passed"
        elif .done and .conclusion != null and .conclusion != "success" then "failed"
        else "running" end' | sort -u
}
for m in "${@:2}"; do
  while s=$(state "$m"); ! grep -qx passed <<<"$s"; do
    if [ "$s" = failed ]; then die "${m#*-} finished its leg without passing, so this does not ship"; fi
    [ "$SECONDS" -lt "$deadline" ] || die "gave up after 25 min waiting for ${m#*-}'s leg"
    sleep 20
  done
  note "${m#*-} passed its leg"
done
