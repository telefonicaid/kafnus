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


import os

import pytest
from dotenv import load_dotenv
load_dotenv(override=True)

from common.common_test import multiservice_stack
from common.utils.wait_services import wait_for_kafnus_ngsi

@pytest.fixture
def ngsi_env(multiservice_stack, requires_env):
    """
    Ensures kafnus-ngsi is running with the env a scenario's requires_env.json
    resolves to (see scenario_loader.discover_scenarios), recreating the
    container only when that differs from what's already running. Most
    scenarios need nothing here -- the container already starts at every
    KAFNUS_NGSI_* flag's real default.
    """
    prefix_topic = os.getenv("KAFNUS_NGSI_PREFIX_TOPIC", "smc_")
    suffix_topic = os.getenv("KAFNUS_NGSI_SUFFIX_TOPIC", "_processed")

    def ready_check():
        wait_for_kafnus_ngsi(
            f"{multiservice_stack.kafkaHost}:{multiservice_stack.kafkaPort}",
            prefix_topic=prefix_topic,
            suffix_topic=suffix_topic
        )

    multiservice_stack.compose.ensure_service_env("kafnus-ngsi", requires_env, ready_check=ready_check)

def pytest_terminal_summary(terminalreporter, exitstatus, config):
    """
    Print a summary of the test results at the end of the test run.
    """
    terminalreporter.write_sep("=", "📋 Scenario Summary")
    for report in terminalreporter.stats.get("passed", []):
        if report.when == "call":
            terminalreporter.write_line(f"✅ {report.nodeid}")
    for report in terminalreporter.stats.get("failed", []):
        if report.when == "call":
            terminalreporter.write_line(f"❌ {report.nodeid}")