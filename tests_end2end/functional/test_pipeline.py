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
from utils.scenario_loader import load_scenario
from utils.postgis_validator import PostgisValidator
from utils.mongo_validator import MongoValidator
from utils.sql_runner import execute_sql_file
from config import logger
from utils.scenario_loader import discover_scenarios, load_description
import time
from config import DEFAULT_DB_CONFIG

@pytest.mark.parametrize("scenario_name, expected_list, input_json, setup", discover_scenarios())
def test_e2e_pipeline(scenario_name, expected_list, input_json, setup, multiservice_stack, http_validators):
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

    # Step 0: Load scenario description if available
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
    from common_test import ServiceOperations
    service_operations = ServiceOperations(multiservice_stack, [orion_request])
    service_operations.orion_set_up()

    # Step 3: Validate all expected files
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
            validators = http_validators  # it comes from fixture
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
                validator = validators.get(url)
                if not validator:
                    all_valid = False
                    errors.append(f"❌ HttpValidator was not found for url: {url}")
                    continue
                ok = validator.validate(headers, body, timeout=30)
                if not ok:
                    all_valid = False
                    errors.append(f"❌ HTTP validation failed for {url}")


        else:
            logger.warning(f"⚠️ Unknown expected type '{expected_type}' — skipping.")

    # Step 4: Assert final result
    if all_valid:
        logger.info(f"✅ Scenario {scenario_name} passed successfully.")
    else:
        logger.error(f"❌ Scenario {scenario_name} failed.")
        assert all_valid, f"❌ Errors in scenario {scenario_name}:\n" + "\n".join(errors)

