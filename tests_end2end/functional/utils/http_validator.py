# Copyright 2025 Telefónica Soluciones de Informática y Comunicaciones de España, S.A.U.
# PROJECT: Kafnus
#
# This software and / or computer program has been developed by Telefónica Soluciones
# de Informática y Comunicaciones de España, S.A.U (hereinafter TSOL) and is protected
# as copyright by the applicable legislation on intellectual property.
#
# It belongs to TSOL, and / or its licensors, the exclusive rights of reproduction,
# distribution, public communication and transformation, and any economic right on it,
# all without prejudice of the moral rights of the authors mentioned above. It is expressly
# forbidden to decompile, disassemble, reverse engineer, sublicense or otherwise transmit
# by any means, translate or create derivative works of the software and / or computer
# programs, and perform with respect to all or part of such programs, any type of exploitation.
#
# Any use of all or part of the software and / or computer program will require the
# express written consent of TSOL. In all cases, it will be necessary to make
# an express reference to TSOL ownership in the software and / or computer
# program.
#
# Non-fulfillment of the provisions set forth herein and, in general, any violation of
# the peaceful possession and ownership of these rights will be prosecuted by the means
# provided in both Spanish and international law. TSOL reserves any civil or
# criminal actions it may exercise to protect its rights.

import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse
from config import logger
import json

class RequestHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        logger.debug(f"do_POST")
        content_length = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(content_length)
        try:
            body = json.loads(body_bytes.decode("utf-8"))
        except Exception:
            body = body_bytes.decode("utf-8")
        self.server.requests.append({
            "path": self.path,
            "headers": dict(self.headers),
            "body": body
        })
        
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"OK")


class HttpValidator:
    def __init__(self, url, expected_path="/"):
        parsed = urlparse(url)
        self.host = parsed.hostname or "0.0.0.0"
        self.port = parsed.port or 3333
        self.expected_path = expected_path
        self.requests = []
        self.httpd = HTTPServer((self.host, self.port), RequestHandler)
        self.httpd.requests = self.requests
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        logger.info(f"HTTPServer {self.host} and {self.port} started")

    def validate(self, headers, body):
        """
        Validates that the expected data is present in the table.

        - `expected_rows`: list of dicts with keys that must match in each row.
        - Repeats until all expected rows appear in the table, or the timeout is reached.
        """
        headers = headers or {}
        body = body or {}
        for req in self.requests:
            reqbody = req["body"]
            if reqbody == body:
                return True

        return False

    def stop(self):
        logger.info(f"validator and HTTPServer stopped")
        self.httpd.shutdown()
        self.thread.join()
