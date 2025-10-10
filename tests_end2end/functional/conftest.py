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

from dotenv import load_dotenv
load_dotenv(override=True)

from common_test import multiservice_stack

import pytest
import time
from config import logger
from utils.scenario_loader import load_scenario
from utils.http_validator import HttpValidator

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

# ──────────────────────────────
# HTTP Validators Fixture
# ──────────────────────────────
@pytest.fixture(scope="function")
def http_validators(request):
    """
    Starts HTTP mocks only if the test scenario has an 'http' expected type.
    Otherwise, returns an empty dict without doing anything.
    """
    validators = {}

    # Get expected_list from parametrized test
    callspec = getattr(request.node, "callspec", None)
    expected_list = callspec.params.get("expected_list") if callspec else None

    # Skip fixture completely if no HTTP expected
    has_http = any(et == "http" for et, _ in (expected_list or []))
    if not has_http:
        logger.debug("⏩ No HTTP expectations in this scenario — skipping HttpValidator setup.")
        yield {}
        return

    for expected_type, expected_json in expected_list:
        if expected_type != "http":
            continue
        expected_data = load_scenario(expected_json, as_expected=True)
        for req in expected_data:
            url = req.get("url")
            response = req.get("response", {}) or {}
            status = response.get("status", 200)
            body = response.get("body")
            if not url:
                continue
            if url not in validators:
                validators[url] = HttpValidator(url, status, body)

    logger.info(f"🚀 Started {len(validators)} mock HTTP servers for this scenario")

    time.sleep(0.5)
    yield validators

    # teardown
    for v in validators.values():
        try:
            v.stop()
        except Exception:
            logger.exception("Error stopping HttpValidator")
    logger.info("🛑 Mock HTTP servers stopped")