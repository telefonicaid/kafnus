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
import time

from functional.scenario_loader import load_scenario, discover_scenarios, load_description
from common.utils.postgis_validator import PostgisValidator
from common.utils.mongo_validator import MongoValidator
from common.utils.http_validator import HttpValidator
from common.utils.sql_runner import execute_sql_file
from common.config import logger, DEFAULT_DB_CONFIG
from common.common_test import ServiceOperations

@pytest.mark.parametrize("scenario_name, expected_list, input_json, setup", discover_scenarios())
def test_e2e_pipeline(scenario_name, expected_list, input_json, setup, multiservice_stack):
    """
    End-to-end test for a given scenario:
    1. Executes optional setup SQL file to prepare database state.
    2. Loads and sends data updates to the Orion Context Broker.
    3. Validates that the final database state matches the expected output.

    Parameters:
    - scenario_name: Name of the test case.
    - input_json: Path to the input scenario JSON file.
    - expected_list: List with path to the expected database state JSON files.
    - setup_sql: Optional SQL file for DB setup.
    - multiservice_stack: Pytest fixture providing connection info to deployed services.
    """
    logger.info(f"🧪 Running scenario: {scenario_name}")

    all_valid = True
    errors = []
    http_validators = {}

    # Step 0: Description
    scenario_dir = input_json.parent
    desc = load_description(scenario_dir)
    if desc:
        logger.info(f"0. Description: {desc}")

    # Step 1: Setup SQL (if any)
    if setup:
        logger.info(f"📜 Executing setup SQL: {setup.name}")
        execute_sql_file(setup, db_config=DEFAULT_DB_CONFIG)

    # Step 2: Load input.json
    orion_request = load_scenario(input_json)

    # 🔹 Step 2.1: Pre-create HTTP mocks (before Orion notifications)
    # Find any expected_http.json in expected_list and start servers early
    for expected_type, expected_json in expected_list:
        if expected_type != "http":
            continue
        expected_data = load_scenario(expected_json, as_expected=True)
        for req in expected_data:
            url = req["url"]
            response = req.get("response", {}) or {}
            status = response.get("status", 200)
            body = response.get("body")
            if url not in http_validators:
                http_validators[url] = HttpValidator(url, status, body)

    if http_validators:
        logger.info(f"🚀 Pre-started {len(http_validators)} HTTP mock servers before Orion updates")
        time.sleep(0.5)  # tiny delay for socket readiness

    # Step 2.2: Send updates to Orion
    service_operations = ServiceOperations(multiservice_stack, [orion_request])
    service_operations.orion_set_up()

    # Step 3: Validate all expected files
    try:
        for expected_type, expected_json in expected_list:
            logger.info(f"🔍 Validating expected type: {expected_type} ({expected_json.name})")
            expected_data = load_scenario(expected_json, as_expected=True)

            if expected_type == "pg":
                validator = PostgisValidator(DEFAULT_DB_CONFIG)
                for table_data in expected_data:
                    table = table_data["table"]
                    if "rows" in table_data:
                        if not validator.validate(table, table_data["rows"]):
                            all_valid = False
                            errors.append(f"❌ PG validation failed in table {table}")
                    if "absent" in table_data:
                        if not validator.validate_absent(table, table_data["absent"]):
                            all_valid = False
                            errors.append(f"❌ PG forbidden rows in table {table}")

            elif expected_type == "mongo":
                validator = MongoValidator()
                try:
                    for coll_data in expected_data:
                        coll = coll_data["collection"]
                        if "documents" in coll_data:
                            if not validator.validate(coll, coll_data["documents"]):
                                all_valid = False
                                errors.append(f"❌ Mongo validation failed in {coll}")
                        if "absent" in coll_data:
                            if not validator.validate_absent(coll, coll_data["absent"]):
                                all_valid = False
                                errors.append(f"❌ Mongo forbidden docs in {coll}")
                finally:
                    validator.close()

            elif expected_type == "http":
                for req in expected_data:
                    url = req["url"]
                    headers = {}
                    raw_headers = req.get("headers")
                    if isinstance(raw_headers, list):
                        for h in raw_headers:
                            if isinstance(h, dict):
                                headers.update(h)
                    else:
                        headers = raw_headers or {}
                    body = req.get("body")
                    validator = http_validators.get(url)
                    if not validator:
                        all_valid = False
                        errors.append(f"❌ HttpValidator not found for {url}")
                        continue
                    ok = validator.validate(headers, body, timeout=30)
                    if not ok:
                        all_valid = False
                        errors.append(f"❌ HTTP validation failed for {url}")

            else:
                logger.warning(f"⚠️ Unknown expected type '{expected_type}' — skipping.")
    finally:
        # Step 5: Teardown HTTP servers
        if http_validators:
            for v in http_validators.values():
                try:
                    v.stop()
                except Exception:
                    logger.exception("Error stopping HttpValidator")
            logger.info("🛑 Mock HTTP servers stopped")

    # Step 6: Assert final result
    if all_valid:
        logger.info(f"✅ Scenario {scenario_name} passed successfully.")
    else:
        logger.error(f"❌ Scenario {scenario_name} failed.")
        assert all_valid, f"❌ Errors in scenario {scenario_name}:\n" + "\n".join(errors)