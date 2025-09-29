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
import time
import socket

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

        # Use response dynamically stored in server
        response_code = getattr(self.server, "response_code", 200)
        response_content = getattr(self.server, "response_content", {"status": "OK"})

        response_body = json.dumps(response_content).encode("utf-8")
        self.send_response(response_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response_body)))
        self.end_headers()
        self.wfile.write(response_body)

    def do_GET(self):
        # health endpoint
        self.send_response(200)
        b = json.dumps({"status": "ok"}).encode("utf-8")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    # suppress default logging (optional)
    def log_message(self, format, *args):
        logger.debug("HTTPServer: " + (format % args))


class ReusableHTTPServer(HTTPServer):
    allow_reuse_address = True

class HttpValidator:
    _servers = {}
    _lock = threading.Lock()

    def __init__(self, url, response_code=200, response_content=None, bind_host=None):
        parsed = urlparse(url)
        # always bind to 0.0.0.0 unless explicit bind_host provided
        self.host = bind_host or "0.0.0.0"
        self.advertised_host = parsed.hostname or "127.0.0.1"  # informational: used by tests to build callback URLs
        self.port = parsed.port or 3333
        self.key = (self.host, self.port)

        with HttpValidator._lock:
            if self.key in HttpValidator._servers:
                # Reuse current server, but clear previous requests
                self.httpd, self.thread, self.requests = HttpValidator._servers[self.key]
                self.requests.clear()
                logger.info(f"Reusing HTTPServer {self.host}:{self.port}")
            else:
                # Create a new server and bind immediately (HTTPServer binds on instantiation)
                self.requests = []
                self.httpd = ReusableHTTPServer((self.host, self.port), RequestHandler)
                self.httpd.requests = self.requests
                self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
                self.thread.start()
                HttpValidator._servers[self.key] = (self.httpd, self.thread, self.requests)
                logger.info(f"HTTPServer {self.host}:{self.port} started")

        # Always update response
        self.update_response(response_code, response_content or {"status": "OK"})

        # ensure server socket is reachable from the test host (quick check)
        if not self._wait_socket_ready(timeout=3):
            logger.warning(f"HTTP server at {self.host}:{self.port} not accepting connections immediately")

    def _wait_socket_ready(self, timeout=3):
        start = time.time()
        while time.time() - start < timeout:
            try:
                with socket.create_connection((self.host, self.port), timeout=1):
                    return True
            except OSError:
                time.sleep(0.1)
        return False

    def update_response(self, response_code=200, response_content=None):
        """Update response on the running server"""
        self.httpd.response_code = response_code
        if response_content is not None:
            self.httpd.response_content = response_content

    def _matches(self, reqbody, expected_body):
        # If both dicts, check that expected_body items are present in reqbody (subset match)
        if isinstance(reqbody, dict) and isinstance(expected_body, dict):
            # allow nested check: every k in expected present in reqbody and equal
            for k, v in expected_body.items():
                if k not in reqbody:
                    return False
                if reqbody[k] != v:
                    return False
            return True
        # otherwise fallback to direct equality
        return reqbody == expected_body

    def validate(self, expected_headers=None, expected_body=None, timeout=30, poll_interval=0.5, ignore_recvtime=False):
        """
        Wait until a request matching expected_body (and optionally headers) appears
        in the collected requests, or timeout occurs.
        - expected_headers: dict or None (only checked if provided)
        - expected_body: dict/string or None
        - timeout: seconds to wait
        Returns True if found, False otherwise.
        """
        start = time.time()
        expected_body = expected_body or {}
        expected_headers = expected_headers or {}

        while time.time() - start < timeout:
            # iterate over a snapshot to avoid concurrency issues
            snapshot = list(self.requests)
            for req in snapshot:
                reqbody = req.get("body")
                # optional recvTime ignore: if expected_body has keys present we only compare those
                if self._matches(reqbody, expected_body):
                    # headers check (subset)
                    if expected_headers:
                        reqheaders = {k.lower(): v for k, v in req.get("headers", {}).items()}
                        ok = True
                        for hk, hv in expected_headers.items():
                            if reqheaders.get(hk.lower()) != hv:
                                ok = False
                                break
                        if not ok:
                            continue
                    return True
            time.sleep(poll_interval)

        logger.debug(f"Timeout waiting for expected HTTP request. Requests recorded: {len(self.requests)}")
        return False

    def stop(self):
        logger.info(f"validator and HTTPServer stopped")
        try:
            self.httpd.shutdown()
            self.httpd.server_close()
        except Exception as e:
            logger.warning(f"Error stopping server: {e}")
        # join thread if alive
        try:
            if self.thread.is_alive():
                self.thread.join(timeout=2)
        except Exception:
            pass
        with HttpValidator._lock:
            HttpValidator._servers.pop(self.key, None)
