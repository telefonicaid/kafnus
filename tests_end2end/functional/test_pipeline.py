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
from utils.http_validator import HttpValidator
from utils.sql_runner import execute_sql_file
from config import logger
from utils.scenario_loader import discover_scenarios, load_description
import time
from config import DEFAULT_DB_CONFIG

@pytest.mark.parametrize("scenario_name, scenario_type, input_json, expected_json, setup", discover_scenarios())
def test_e2e_pipeline(scenario_name, scenario_type, input_json, expected_json, setup, multiservice_stack):
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
    validator = None
    expected_data = None

    # Step 0: Load scenario description if available
    scenario_dir = input_json.parent
    desc = load_description(scenario_dir)
    if desc:
        logger.info(f"0. Description: {desc}")

    # Step 1: Execute setup SQL
    if scenario_type == "pg" and setup:
        logger.info(f"1. Executing setup SQL script: {setup.name}")
        execute_sql_file(setup, db_config=DEFAULT_DB_CONFIG)
    elif scenario_type == "http":
        logger.info(f"1. Loading validator HTTP for expected: {expected_json.name}")
        expected_data = load_scenario(expected_json, as_expected=True)
        validators = {}
        for request_data in expected_data:
            url = request_data["url"]
            response = request_data["response"]
            response_status = response["status"]
            response_body = response["body"]
            if url not in validators:
                validators[url] = HttpValidator(url, response_status, response_body)
    else:
        logger.info("1. No setup SQL/HTTP provided for this scenario.")

    # Step 2: Load input.json and send updates to CB
    logger.info(f"2. Loading and sending updates from: {input_json.name}")
    orion_request = load_scenario(input_json)
    from common_test import ServiceOperations
    service_operations = ServiceOperations(multiservice_stack, [orion_request])
    service_operations.orion_set_up()

    # Step 3: Validate result in PostGIS / Mongo / HTTP
    logger.info(f"3. Waiting results against expected: {expected_json.name}")
    if scenario_type == "pg":
        expected_data = load_scenario(expected_json, as_expected=True)
        validator = PostgisValidator(DEFAULT_DB_CONFIG)

    all_valid = True
    errors = []

    if scenario_type == "pg":
        for table_data in expected_data:
            table = table_data["table"]
            if "rows" in table_data:
                rows = table_data["rows"]
                result = validator.validate(table, rows)
                if result is not True:
                    logger.error(f"❌ Validation failed in table: {table}")
                    all_valid = False
                    errors.append(f"❌ Error in table: {table} (present rows)")
                else:
                    logger.debug(f"✅ Table {table} validated successfully (present rows)")

            if "absent" in table_data:
                forbidden_rows = table_data["absent"]
                result = validator.validate_absent(table, forbidden_rows)
                if result is not True:
                    logger.error(f"❌ Forbidden rows found in table: {table}")
                    all_valid = False
                    errors.append(f"❌ Error in table: {table} (forbidden rows)")
                else:
                    logger.debug(f"✅ Table {table} validated successfully (forbidden rows absent)")

    if scenario_type == "mongo":
        expected_docs = load_scenario(expected_json, as_expected=True)
        validator = MongoValidator()
        
        try:
            for coll_data in expected_docs:
                coll = coll_data["collection"]
                if "documents" in coll_data:
                    assert validator.validate(coll, coll_data["documents"])
                if "absent" in coll_data:
                    assert validator.validate_absent(coll, coll_data["absent"])
        finally:
            validator.close()
    
    if scenario_type == "http":
        try:
            for request_data in expected_data:
                url = request_data["url"]
                raw_headers = request_data.get("headers")
                if isinstance(raw_headers, list):
                    headers = {}
                    for h in raw_headers:
                        if isinstance(h, dict):
                            headers.update(h)
                else:
                    headers = raw_headers or {}
                body = request_data.get("body")
                validator = validators[url]
                ok = validator.validate(headers, body, timeout=30) # long timeout because http is the first flow to test
                if not ok:
                    logger.error(f"❌ Validation failed in request: {request_data}")
                    all_valid = False
                    errors.append(f"❌ Error in request: {request_data}")
                else:
                    logger.debug(f"✅ request {request_data} validated successfully")
        finally:
            for v in validators.values():
                v.stop()

    if all_valid:
        logger.info(f"✅ Scenario {scenario_name} passed successfully.")
    else:
        logger.error(f"❌ Scenario {scenario_name} failed.")

    assert all_valid, f"❌ Errors in scenario: {scenario_name}\n" + "\n".join(errors)
