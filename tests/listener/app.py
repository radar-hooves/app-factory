import http.server
import runpy
import threading
import urllib.request

conf = runpy.run_path("/conf/gunicorn.conf.py")
print("bind", conf["bind"], flush=True)


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200)
        s.end_headers()
        s.wfile.write(b"ok")

    def log_message(*a):
        pass


for b in conf["bind"]:
    host, port = b.rsplit(":", 1)
    srv = http.server.ThreadingHTTPServer((host, int(port)), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
r = urllib.request.urlopen(
    urllib.request.Request("http://alloy:4318/v1/traces", data=b"span", method="POST"), timeout=5
)
print("trace sent", r.status, flush=True)
threading.Event().wait(60)
