#!/usr/bin/env bash
# The listener proof (app-factory#109): the rendered gunicorn.conf.py, run by the
# stamp's real `listen_addresses` on a container that joins the front door's
# network, a telemetry network and a third shared network, answers on the first,
# refuses on the other two, and still delivers a trace to the collector across
# the second. Run twice: the front door found by name, then the front door
# multi-homed so the name resolves to the third network and the deployment's
# trusted-proxy declaration names the right one. Usage: proof.sh <rendered backend dir> <port>
set -eu
here=$(cd "$(dirname "$0")" && pwd); conf=$(cd "$1" && pwd); port=$2
p="listener-proof-$$"; img=python:3.14-slim
proxies=$(grep -o '"[A-Z_]*_TRUSTED_PROXY_NETWORKS"' "$conf/gunicorn.conf.py" | tr -d '"' | head -1)
[ -n "$proxies" ] || { echo "FAIL: gunicorn.conf.py names no trusted-proxy setting"; exit 1; }
cleanup() {
  docker rm -f $p-app $p-alloy $p-fd >/dev/null 2>&1 || true
  docker network rm $p-own $p-tel $p-third >/dev/null 2>&1 || true
}
trap cleanup EXIT
ip_on() { docker inspect -f "{{(index .NetworkSettings.Networks \"$p-$2\").IPAddress}}" "$p-$1"; }
probe() { docker run --rm --network "$p-$1" -v "$here/probe.py:/p.py:ro" $img python /p.py "http://$(ip_on app "$1"):$port/"; }

run() { # $1 label, $2 the front door's first network, $3 extra app env (or empty)
  cleanup
  for n in own tel third; do docker network create $p-$n >/dev/null; done
  docker run -d --name $p-alloy --network $p-tel --network-alias alloy -v "$here/coll.py:/c.py:ro" $img python /c.py >/dev/null
  docker run -d --name $p-fd --network "$p-$2" --network-alias nginx $img sleep 120 >/dev/null
  for n in own third; do [ "$n" = "$2" ] || docker network connect $p-$n $p-fd; done
  extra=""; [ -z "$3" ] || extra="-e $proxies=$(ip_on fd own)/32"
  # shellcheck disable=SC2086
  docker create --name $p-app --network $p-own -v "$here/app.py:/a.py:ro" -v "$conf:/conf:ro" \
    -e OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318 $extra $img python /a.py >/dev/null
  docker network connect $p-tel $p-app; docker network connect $p-third $p-app
  docker start $p-app >/dev/null
  if [ -n "$3" ]; then
    seen=$(docker exec $p-app python -c "import socket;print(socket.gethostbyname('nginx'))")
    [ "$seen" = "$(ip_on fd third)" ] || { echo "FAIL ($1): the name did not resolve to the third network, so the declaration is untested ($seen)"; exit 1; }
  fi
  for _ in $(seq 1 45); do docker logs $p-app 2>&1 | grep -q "trace sent 200" && break; sleep 1; done
  docker logs $p-alloy 2>&1 | grep -q "collector got" || { echo "FAIL ($1): no trace reached the collector"; docker logs $p-app 2>&1 | tail; exit 1; }
  [ "$(probe own)" = "ANSWERED 200" ] || { echo "FAIL ($1): the front door's network did not get an answer"; exit 1; }
  probe tel | grep -q '^REFUSED' || { echo "FAIL ($1): the telemetry network reached the app"; exit 1; }
  probe third | grep -q '^REFUSED' || { echo "FAIL ($1): the third shared network reached the app"; exit 1; }
  echo "listener proof ($1): front door's network answered, telemetry and third refused, trace delivered"
}

run "front door found by name" own ""
run "front door multi-homed, declared" third "declared"
