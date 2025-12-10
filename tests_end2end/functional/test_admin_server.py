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
    assert "timestamp" in data  # Optional: just check it exists

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
    assert "messages_processed_total" in response.text
    assert "message_processing_time_seconds" in response.text
