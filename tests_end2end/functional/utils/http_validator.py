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
import re

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
        req = {
            "path": self.path,
            "headers": dict(self.headers),
            "body": body
        }
        self.server.requests.append(req)

        # Log body for debugging
        try:
            logger.debug(f"HTTPServer received body: {json.dumps(req['body'], ensure_ascii=False) if isinstance(req['body'], (dict, list)) else repr(req['body'])}")
        except Exception:
            logger.debug(f"HTTPServer received body (repr): {repr(req['body'])}")

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
        # simple health endpoint
        self.send_response(200)
        b = json.dumps({"status": "ok"}).encode("utf-8")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def log_message(self, format, *args):
        # suppress base class logging; use our logger
        logger.debug("HTTPServer: " + (format % args))

class ReusableHTTPServer(HTTPServer):
    allow_reuse_address = True

class HttpValidator:
    _servers = {}
    _lock = threading.Lock()

    def __init__(self, url, response_code=200, response_content=None, bind_host=None):
        parsed = urlparse(url)
        self.host = bind_host or "0.0.0.0"
        self.advertised_host = parsed.hostname or "127.0.0.1"
        self.port = parsed.port or 3333
        self.key = (self.host, self.port)

        with HttpValidator._lock:
            if self.key in HttpValidator._servers:
                self.httpd, self.thread, self.requests = HttpValidator._servers[self.key]
                self.requests.clear()
                logger.info(f"Reusing HTTPServer {self.host}:{self.port}")
            else:
                self.requests = []
                self.httpd = ReusableHTTPServer((self.host, self.port), RequestHandler)
                self.httpd.requests = self.requests
                self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
                self.thread.start()
                HttpValidator._servers[self.key] = (self.httpd, self.thread, self.requests)
                logger.info(f"HTTPServer {self.host}:{self.port} started")

        self.update_response(response_code, response_content or {"status": "OK"})
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
        self.httpd.response_code = response_code
        if response_content is not None:
            self.httpd.response_content = response_content

    def _normalize_graphql(self, s):
        # remove indentation/extra whitespace to compare GraphQL queries
        if not isinstance(s, str):
            return s
        # collapse all whitespace including newlines
        collapsed = re.sub(r'\s+', ' ', s).strip()
        return collapsed

    def _try_load_json(self, s):
        if not isinstance(s, str):
            return None
        try:
            return json.loads(s)
        except Exception:
            return None

    def _match_value(self, actual, expected):
        # both dicts -> recursive check (expected subset of actual)
        if isinstance(expected, dict) and isinstance(actual, dict):
            for k, v in expected.items():
                if k not in actual:
                    return False
                if not self._match_value(actual[k], v):
                    return False
            return True

        # string expected vs actual string: allow normalized substring (helps GraphQL multiline)
        if isinstance(expected, str):
            # if actual is dict and contains 'query', compare that
            if isinstance(actual, dict) and 'query' in actual:
                act = self._normalize_graphql(actual['query'])
                exp = self._normalize_graphql(expected)
                return exp in act or act in exp
            if isinstance(actual, str):
                # try to load JSON inside actual
                maybe = self._try_load_json(actual)
                if isinstance(maybe, dict):
                    return self._match_value(maybe, expected)
                act_norm = self._normalize_graphql(actual)
                exp_norm = self._normalize_graphql(expected)
                # substring tolerant
                return exp_norm in act_norm or act_norm in exp_norm
            # fallback
            return str(expected) == str(actual)

        # if expected is not str and actual is str, attempt to json.loads actual and compare
        if isinstance(actual, str):
            maybe = self._try_load_json(actual)
            if maybe is not None:
                return self._match_value(maybe, expected)
            return str(actual) == str(expected)

        # final fallback to equality
        return actual == expected

    def _matches(self, reqbody, expected_body):
        # if expected empty => accept any
        if not expected_body:
            return True
        # if expected is dict: check subset match
        return self._match_value(reqbody, expected_body)

    def _normalize_expected_headers(self, expected_headers):
        # Accept dict or list of dicts
        if not expected_headers:
            return {}
        if isinstance(expected_headers, dict):
            return {k.lower(): v for k, v in expected_headers.items()}
        if isinstance(expected_headers, list):
            merged = {}
            for d in expected_headers:
                if isinstance(d, dict):
                    for k, v in d.items():
                        merged[k.lower()] = v
            return merged
        return {}

    def validate(self, expected_headers=None, expected_body=None, timeout=30, poll_interval=1):
        start = time.time()
        expected_body = expected_body or {}
        expected_headers = self._normalize_expected_headers(expected_headers)

        while time.time() - start < timeout:
            snapshot = list(self.requests)
            for req in snapshot:
                reqbody = req.get("body")
                if self._matches(reqbody, expected_body):
                    # headers check (subset)
                    if expected_headers:
                        reqheaders = {k.lower(): v for k, v in req.get("headers", {}).items()}
                        ok = True
                        for hk, hv in expected_headers.items():
                            if reqheaders.get(hk) != hv:
                                ok = False
                                break
                        if not ok:
                            continue
                    return True
            time.sleep(poll_interval)

        # timeout -> log detailed info to help debugging
        logger.debug(f"Timeout waiting for expected HTTP request. Requests recorded: {len(self.requests)}")
        for i, r in enumerate(self.requests):
            try:
                body_repr = json.dumps(r['body'], ensure_ascii=False) if isinstance(r['body'], (dict, list)) else repr(r['body'])
            except Exception:
                body_repr = repr(r.get('body'))
            logger.debug(f"Recorded request #{i}: path={r.get('path')}, headers_keys={list(r.get('headers',{}).keys())}, body={body_repr}")
        return False

    def stop(self):
        logger.info(f"validator and HTTPServer stopped")
        try:
            self.httpd.shutdown()
            self.httpd.server_close()
        except Exception as e:
            logger.warning(f"Error stopping server: {e}")
        try:
            if self.thread.is_alive():
                self.thread.join(timeout=2)
        except Exception:
            pass
        with HttpValidator._lock:
            HttpValidator._servers.pop(self.key, None)
