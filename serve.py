"""Local preview server with correct MIME types (Windows registry can map .js to text/plain,
which browsers refuse for ES modules). Usage: python serve.py [port]"""
import http.server
import socketserver
import sys
from functools import partial
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".html": "text/html",
    }

    def guess_type(self, path):
        ext = Path(str(path)).suffix.lower()
        return self.extensions_map.get(ext) or super().guess_type(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", PORT), partial(Handler, directory=str(Path(__file__).parent))) as httpd:
    print(f"Serving http://127.0.0.1:{PORT}/")
    httpd.serve_forever()
