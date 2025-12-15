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

import time
import pytest
import requests

from common.common_test import OrionRequestData, ServiceOperations
from common.config import logger, DEFAULT_DB_CONFIG
from common.utils.postgis_validator import PostgisValidator

# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------

def stop_postgres(docker_dir):
    """Stops the Postgres container to simulate DB outage."""
    import subprocess
    logger.info("🛑 Stopping Postgres to simulate outage...")
    subprocess.check_call(["docker", "compose", "-f", f"{docker_dir}/docker-compose.postgis.yml",
                           "stop", "iot-postgis"])
    time.sleep(2)


def start_postgres(docker_dir):
    """Starts Postgres again after simulated outage."""
    import subprocess
    logger.info("🚀 Starting Postgres again...")
    subprocess.check_call(["docker", "compose", "-f", f"{docker_dir}/docker-compose.postgis.yml",
                           "start", "iot-postgis"])
    time.sleep(5)


def wait_connector_running(connector_url, timeout=60):
    """Waits until the connector task goes back to RUNNING after outage."""
    logger.info("⏳ Waiting for connector task to recover...")

    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = requests.get(connector_url)
            data = resp.json()
            print(f"RAW DATA: {data}")

            task = data["tasks"][0]["state"]
            print(f"TASKS: {data["tasks"]}")
            print(f"TASK STATE: {task}")
            if task == "RUNNING":
                logger.info("✅ Connector task is RUNNING again")
                return True
        except Exception:
            pass

        time.sleep(2)

    raise TimeoutError("❌ Connector task never returned to RUNNING state")