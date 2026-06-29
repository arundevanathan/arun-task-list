from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os


ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
TASK_BOARD_PATH = ROOT / "TASK_BOARD.md"
PORT = int(os.environ.get("PORT", "3000"))


class TaskBoardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def send_json(self, status_code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/task-board":
            markdown = TASK_BOARD_PATH.read_text(encoding="utf-8")
            self.send_json(200, {"markdown": markdown})
            return

        super().do_GET()

    def do_PUT(self):
        if self.path != "/api/task-board":
            self.send_error(404, "Not found")
            return

        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8")

        try:
            payload = json.loads(body or "{}")
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Expected valid JSON."})
            return

        markdown = payload.get("markdown")
        if not isinstance(markdown, str):
            self.send_json(400, {"error": "Expected a markdown string."})
            return

        TASK_BOARD_PATH.write_text(markdown, encoding="utf-8")
        self.send_json(200, {"markdown": markdown})


if __name__ == "__main__":
    server = ThreadingHTTPServer(("localhost", PORT), TaskBoardHandler)
    print(f"Task board running at http://localhost:{PORT}")
    server.serve_forever()
