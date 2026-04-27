# Copyright 2026 Telefónica Soluciones de Informática y Comunicaciones de España, S.A.U.
#
# This file is part of kafnus
#
# kafnus is free software: you can redistribute it and/or
# modify it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# kafnus is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
# General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with kafnus. If not, see http://www.gnu.org/licenses/.


import pytest
import requests
import json
import os
import time

from common.config import logger


@pytest.fixture(scope="session")
def admin_base_url(multiservice_stack):
    """
    Returns the admin server base URL (reuses the multiservice_stack).
    If not available, uses localhost:8000 as a fallback.
    """
    logger.info("Test case to check Admin Server endpoints. This test checks health, log level and metrics endpoints.")

    host = getattr(multiservice_stack, "ngsiAdminHost", "localhost")
    port = getattr(multiservice_stack, "ngsiAdminPort", int(os.getenv("KAFNUS_NGSI_ADMIN_PORT", 8000)))
    base_url = f"http://{host}:{port}"
    logger.info(f"🧭 Using admin base URL: {base_url}")

    # Wait for the admin server to become available
    for _ in range(30):
        try:
            r = requests.get(f"{base_url}/metrics", timeout=1)
            if r.status_code == 200:
                logger.info("✅ Admin server is ready")
                break
        except Exception:
            time.sleep(1)
    else:
        pytest.skip(f"❌ Admin server not reachable at {base_url}")

    return base_url

def test_health_endpoint(admin_base_url):
    """Should return health status of the Admin Server"""
    response = requests.get(f"{admin_base_url}/health")

    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] == "UP"
    assert "timestamp" in data
    assert "uptimeSeconds" in data
    assert "service" in data
    assert data["service"]["name"] == "kafnus-ngsi"
    assert "nodeVersion" in data["service"]
    assert "process" in data
    assert "memory" in data["process"]
    assert "admin" in data
    assert "endpoints" in data["admin"]
    assert "/health" in data["admin"]["endpoints"]
    assert "pipeline" in data
    assert "totalEvents" in data["pipeline"]
    assert "successEvents" in data["pipeline"]
    assert "errorEvents" in data["pipeline"]
    assert "successRate" in data["pipeline"]
    assert "byFlow" in data["pipeline"]
    assert "metrics" in data
    assert "registeredMetrics" in data["metrics"]

def test_get_log_level(admin_base_url):
    """Should return current log level """
    response = requests.get(f"{admin_base_url}/logLevel")
    assert response.status_code == 200
    data = response.json()
    assert "level" in data  # it should containt level field


def test_set_log_level(admin_base_url):
    """Should change log level"""
    new_level = "DEBUG"

    response = requests.post(
        f"{admin_base_url}/logLevel",
        headers={"Content-Type": "application/json"},
        data=json.dumps({"level": new_level})
    )
    assert response.status_code == 200

    data = response.json()
    assert data["ok"] is True
    assert data["level"] == new_level

    # Validate with GET
    response_check = requests.get(f"{admin_base_url}/logLevel")
    assert response_check.status_code == 200
    assert response_check.json()["level"] == new_level


def test_metrics_endpoint(admin_base_url):
    """Should return Prometheus metrics"""
    response = requests.get(f"{admin_base_url}/metrics")

    assert response.status_code == 200
    assert "message_processing_time_seconds" in response.text
    assert "messages_processed_by_service_total" in response.text
    assert "admin_http_server_requests_total" in response.text


def test_metrics_endpoint_rejects_unsupported_accept(admin_base_url):
    """Should return 406 if Accept header does not allow Prometheus text format"""
    response = requests.get(
        f"{admin_base_url}/metrics",
        headers={"Accept": "application/json"}
    )

    assert response.status_code == 406
    payload = response.json()
    assert payload["error"] == "NotAcceptable"


def test_config_env_endpoint(admin_base_url):
    """Should return runtime environment variables with sensitive values masked"""
    response = requests.get(f"{admin_base_url}/config")

    assert response.status_code == 200
    data = response.json()
    assert "variables" in data
    variables = data["variables"]
    assert isinstance(variables, dict)

    # Sensitive keys must be masked
    for key, value in variables.items():
        if any(s in key.upper() for s in ("PASSWORD", "SECRET", "TOKEN", "PRIVATE_KEY", "SASL")):
            assert value == "***redacted***", f"Key {key} should be masked"


def test_config_env_endpoint_rejects_write(admin_base_url):
    """Should return 405 for PATCH since /config is read-only"""
    response = requests.patch(
        f"{admin_base_url}/config",
        headers={"Content-Type": "application/json"},
        data=json.dumps({"updates": {"KAFNUS_NGSI_LOG_LEVEL": "DEBUG"}})
    )

    assert response.status_code == 405
