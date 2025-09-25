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
    response_code = 200
    response_content = {"status": "OK"}

    def do_POST(self):
        logger.debug("do_POST")
        content_length = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(content_length)
        try:
            body = json.loads(body_bytes.decode("utf-8"))
        except Exception:
            body = body_bytes.decode("utf-8")

        # Save request
        self.server.requests.append({
            "path": self.path,
            "headers": dict(self.headers),
            "body": body
        })

        # Use response dinamically stored in server
        response_code = getattr(self.server, "response_code", 200)
        response_content = getattr(self.server, "response_content", {"status": "OK"})

        response_body = json.dumps(response_content).encode("utf-8")
        self.send_response(response_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response_body)))
        self.end_headers()
        self.wfile.write(response_body)

class ReusableHTTPServer(HTTPServer):
    allow_reuse_address = True

class HttpValidator:
    # shared pool of servers already created
    _servers = {}

    def __init__(self, url, response_code=200, response_content=None):
        parsed = urlparse(url)
        self.host = parsed.hostname or "0.0.0.0"
        self.port = parsed.port or 3333
        self.key = (self.host, self.port)

        if self.key in HttpValidator._servers:
            # Reuses current server
            self.httpd, self.thread, self.requests = HttpValidator._servers[self.key]
            logger.info(f"Reusing HTTPServer {self.host}:{self.port}")
        else:
            # Creates a new server
            self.requests = []
            self.httpd = ReusableHTTPServer((self.host, self.port), RequestHandler)
            self.httpd.requests = self.requests
            self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
            self.thread.start()
            HttpValidator._servers[self.key] = (self.httpd, self.thread, self.requests)
            logger.info(f"HTTPServer {self.host}:{self.port} started")

        # Always update response
        self.update_response(response_code, response_content or {"status": "OK"})

    def update_response(self, response_code=200, response_content=None):
        """Update response with the same server"""
        self.httpd.response_code = response_code
        if response_content is not None:
            self.httpd.response_content = response_content

    def validate(self, headers, body):
        """
        Validates that the expected data is present in the table.

        - `expected_rows`: list of dicts with keys that must match in each row.
        - Repeats until all expected rows appear in the table, or the timeout is reached.
        """
        headers = headers or {}
        body = body or {}
        logger.debug(f"validator body {body}")
        for req in self.requests:
            reqbody = req["body"]
            logger.debug(f"validator reqbody {reqbody}")
            if reqbody == body:
                return True
        return False

    def stop(self):
        logger.info(f"validator and HTTPServer stopped")
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join()
        HttpValidator._servers.pop(self.key, None)
