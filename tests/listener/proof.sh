#!/usr/bin/env bash
# The listener proof (app-factory#109): the rendered gunicorn.conf.py, run by the
# stamp's real `listen_addresses` on a container that joins its own network and
# a telemetry network, answers on the first, refuses on the second, and still
# delivers a trace to the collector across it. Usage: proof.sh <rendered backend dir> <port>
set -eu
here=$(cd "$(dirname "$0")" && pwd); conf=$(cd "$1" && pwd); port=$2
p="listener-proof-$$"; img=python:3.14-slim
trap 'docker rm -f $p-app $p-alloy >/dev/null 2>&1 || true; docker network rm $p-own $p-tel >/dev/null 2>&1 || true' EXIT
docker network create $p-own >/dev/null; docker network create $p-tel >/dev/null
docker run -d --name $p-alloy --network $p-tel --network-alias alloy -v "$here/coll.py:/c.py:ro" $img python /c.py >/dev/null
docker create --name $p-app --network $p-own -v "$here/app.py:/a.py:ro" -v "$conf:/conf:ro" \
  -e OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318 $img python /a.py >/dev/null
docker network connect $p-tel $p-app
docker start $p-app >/dev/null
for _ in $(seq 1 30); do docker logs $p-app 2>&1 | grep -q "trace sent 200" && break; sleep 1; done
docker logs $p-alloy 2>&1 | grep -q "collector got" || { echo "FAIL: no trace reached the collector"; docker logs $p-app 2>&1 | tail; exit 1; }
ip_on() { docker inspect -f "{{(index .NetworkSettings.Networks \"$p-$1\").IPAddress}}" $p-app; }
probe() { docker run --rm --network "$p-$1" -v "$here/probe.py:/p.py:ro" $img python /p.py "http://$(ip_on "$1"):$port/"; }
[ "$(probe own)" = "ANSWERED 200" ] || { echo "FAIL: the app's own network did not get an answer"; exit 1; }
probe tel | grep -q '^REFUSED' || { echo "FAIL: the telemetry network reached the app"; exit 1; }
echo "listener proof: own network answered, telemetry network refused, trace delivered"
