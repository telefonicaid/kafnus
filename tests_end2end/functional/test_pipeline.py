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
from utils.sql_runner import execute_sql_file
from config import logger

from config import SCENARIOS_DIR, DEFAULT_DB_CONFIG

def discover_scenarios():
    """
    Discovers all test scenarios by scanning the 'cases' directory.
    Returns a list of tuples containing:
    - scenario name
    - path to input.json
    - path to expected_pg.json
    - optional path to setup.sql if it exists
    """
    logger.debug("🔍 Scanning for test scenarios in: %s", SCENARIOS_DIR)
    cases = []

    for test_dir in sorted(SCENARIOS_DIR.iterdir()):
        if not test_dir.is_dir():
            logger.debug("⏭️ Skipping non-directory: %s", test_dir)
            continue

        input_json = test_dir / "input.json"
        expected_json = test_dir / "expected_pg.json"
        setup_sql = test_dir / "setup.sql"

        if input_json.exists() and expected_json.exists():
            logger.debug("✅ Found scenario: %s", test_dir.name)
            if setup_sql.exists():
                logger.debug("↪️ Includes setup SQL: %s", setup_sql.name)
            else:
                logger.debug("↪️ No setup SQL for: %s", test_dir.name)
            cases.append((test_dir.name, input_json, expected_json, setup_sql if setup_sql.exists() else None))
        else:
            logger.debug("❌ Incomplete scenario in: %s (missing input.json or expected_pg.json)", test_dir)

    logger.debug("🔢 Total scenarios discovered: %d", len(cases))
    return cases

@pytest.mark.parametrize("scenario_name, input_json, expected_json, setup_sql", discover_scenarios())
def test_e2e_pipeline(scenario_name, input_json, expected_json, setup_sql, multiservice_stack):
    """
    End-to-end test for a given scenario:
    1. Executes optional setup SQL file to prepare database state.
    2. Loads and sends data updates to the Orion Context Broker.
    3. Validates that the final PostGIS database state matches the expected output.

    Parameters:
    - scenario_name: Name of the test case.
    - input_json: Path to the input scenario JSON file.
    - expected_json: Path to the expected database state JSON file.
    - setup_sql: Optional SQL file for DB setup.
    - multiservice_stack: Pytest fixture providing connection info to deployed services.
    """
    logger.info(f"🧪 Running scenario: {scenario_name}")

    # Step 1: Execute setup SQL
    if setup_sql:
        logger.info("1. Executing setup SQL script: %s", setup_sql.name)
        execute_sql_file(setup_sql, db_config=DEFAULT_DB_CONFIG)
    else:
        logger.info("1. No setup SQL provided for this scenario.")

    # Step 2: Load input.json and send updates to CB
    logger.info("2. Loading and sending updates from: %s", input_json.name)
    orion_request = load_scenario(input_json)
    from common_test import ServiceOperations
    service_operations = ServiceOperations(multiservice_stack, [orion_request])
    service_operations.orion_set_up()

    # Step 3: Validate result in PostGIS
    logger.info("3. Validating results against expected: %s", expected_json.name)
    expected_data = load_scenario(expected_json, as_expected=True)
    validator = PostgisValidator(DEFAULT_DB_CONFIG)

    all_valid = True
    errors = []

    for table_data in expected_data:
        table = table_data["table"]
        rows = table_data["rows"]
        result = validator.validate(table, rows)
        if result is not True:
            logger.error("❌ Validation failed in table: %s", table)
            all_valid = False
            errors.append(f"❌ Error in table: {table}")
        else:
            logger.debug("✅ Table %s validated successfully", table)

    if all_valid:
        logger.info("✅ Scenario '%s' passed successfully.", scenario_name)
    else:
        logger.error("❌ Scenario '%s' failed.", scenario_name)

    assert all_valid, f"❌ Errors in scenario: {scenario_name}\n" + "\n".join(errors)
