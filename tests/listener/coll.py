import http.server


class H(http.server.BaseHTTPRequestHandler):
    def do_POST(s):
        n = int(s.headers.get("content-length", 0))
        print("collector got", s.rfile.read(n), flush=True)
        s.send_response(200)
        s.end_headers()


http.server.HTTPServer(("0.0.0.0", 4318), H).serve_forever()
