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

import json
from typing import Optional
from pathlib import Path
import os

from common.common_test import OrionRequestData
from common.config import logger

# Directory where all scenario test cases are stored
SCENARIOS_DIR = Path(__file__).parent.parent / "cases"

def discover_scenarios():
    """
    Recursively discovers all test scenarios by scanning the SCENARIOS_DIR.

    Returns a list of tuples:
    - scenario name (relative path from SCENARIOS_DIR)
    - list of (expected_type, expected_path)
    - path to input.json
    - optional path to setup.sql
    """
    logger.debug(f"🔍 Recursively scanning for test scenarios in: {SCENARIOS_DIR}")
    cases = []

    for dirpath, _, filenames in os.walk(SCENARIOS_DIR):
        dir_path = Path(dirpath)
        input_json = dir_path / "input.json"
        setup_sql = dir_path / "setup.sql"

        if not input_json.exists():
            continue

        expected_files = [
            (f.replace("expected_", "").replace(".json", ""), dir_path / f)
            for f in filenames
            if f.startswith("expected_") and f.endswith(".json")
        ]

        if not expected_files:
            continue

        relative_name = str(dir_path.relative_to(SCENARIOS_DIR))
        logger.debug(f"✅ Found scenario: {relative_name} ({[e[0] for e in expected_files]})")

        cases.append(
            (
                relative_name,
                expected_files,
                input_json,
                setup_sql if setup_sql.exists() else None
            )
        )

    cases.sort(key=lambda c: c[0])  # Sort by scenario name (relative path)
    logger.debug(f"🔢 Total scenarios discovered: {len(cases)}")
    return cases

def load_scenario(json_path, as_expected=False):
    """
    Loads a test scenario from a JSON file.

    If loading expected PostGIS data (`as_expected=True`), returns a list of table data dictionaries.
    If loading an Orion scenario (`as_expected=False`), parses it into an OrionRequestData object.

    Parameters:
    - json_path: Path to the JSON scenario file.
    - as_expected: Whether the file represents expected PostGIS output data.

    Returns:
    - A list of dictionaries (if `as_expected=True`) or an OrionRequestData object.
    """
    logger.debug(f"📂 Loading scenario file: {json_path}")

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if as_expected:
        logger.debug("📦 Loading as expected result")
        return data if isinstance(data, list) else [data]
    else:
        logger.debug(f"🛰️ Loading as Orion scenario: {data.get('name')}")
        return OrionRequestData(
            name=data["name"],
            service=data["fiware-service"],
            subservice=data["fiware-servicepath"],
            subscriptions=data["subscriptions"],
            updateEntities=data["updateEntities"],
            deleteEntities=data.get("deleteEntities", [])
        )

def load_description(scenario_dir: Path) -> Optional[str]:
    """
    Loads a human-readable description from a scenario's description.txt file, if present.

    Parameters:
    - scenario_dir: Path to the scenario directory

    Returns:
    - Description string or None if not found
    """
    desc_path = scenario_dir / "description.txt"
    if desc_path.exists():
        return desc_path.read_text(encoding="utf-8").strip()
    return None
