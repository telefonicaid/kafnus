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


import json
import re
from typing import Optional
from pathlib import Path
import os

import pytest

from common.common_test import OrionRequestData
from common.config import logger

# Directory where all scenario test cases are stored
SCENARIOS_DIR = Path(__file__).parent / "cases"

# The compose file that decides which KAFNUS_NGSI_* env vars the e2e stack
# can actually control -- see _supported_ngsi_env_vars().
NGSI_COMPOSE_FILE = SCENARIOS_DIR.parent.parent.parent / "docker" / "docker-compose.ngsi.yml"

def discover_scenarios():
    """
    Recursively discovers all test scenarios by scanning the SCENARIOS_DIR.

    Returns a list of pytest.param entries wrapping tuples of:
    - scenario name (relative path from SCENARIOS_DIR)
    - list of (expected_type, expected_path)
    - path to input.json
    - optional path to setup.sql
    - requires_env: the full resolved dict of every KAFNUS_NGSI_* flag the
      stack supports (see _supported_ngsi_env_vars()), consumed by the
      `ngsi_env` fixture (functional/conftest.py) to recreate the kafnus-ngsi
      container with exactly that env before the scenario runs, only when it
      differs from what's already running (DockerCompose.ensure_service_env).

    A scenario directory may contain a `requires_env.json` file: a mapping of
    env var name -> the value it needs for this scenario's expectations to
    hold. Every scenario resolves to the same full-flag-set dict (see
    _resolve_required_env()), so scenarios needing nothing special all
    compare equal to each other -- sorting by the resolved dict then groups
    them together as one contiguous block, minimizing container recreates
    without that grouping being required for correctness (the fixture always
    compares against the actual last-applied env, regardless of order).

    A scenario whose requires_env.json names a var docker-compose.ngsi.yml
    doesn't forward to the container at all is skipped with a reason instead
    -- there's nothing a container recreate can do about that.
    """
    logger.debug(f"🔍 Recursively scanning for test scenarios in: {SCENARIOS_DIR}")
    cases = []
    supported_vars = _supported_ngsi_env_vars()

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

        resolved_env, skip_reason = _resolve_required_env(dir_path, supported_vars)
        if skip_reason:
            logger.debug(f"⏭️ Scenario {relative_name} skipped: {skip_reason}")

        cases.append(
            (
                relative_name,
                expected_files,
                input_json,
                setup_sql if setup_sql.exists() else None,
                resolved_env,
                skip_reason
            )
        )

    # Sort by resolved env first, name second: every scenario needing
    # nothing special resolves to the same dict, so this clusters them into
    # one contiguous block (an all-"false" dict sorts before one with any
    # "true"), with the few scenarios needing something special running
    # afterward -- minimizing container recreates.
    cases.sort(key=lambda c: (sorted(c[4].items()), c[0]))
    logger.debug(f"🔢 Total scenarios discovered: {len(cases)}")

    return [
        pytest.param(
            name, expected_files, input_json, setup, resolved_env,
            marks=pytest.mark.skip(reason=skip_reason) if skip_reason else ()
        )
        for name, expected_files, input_json, setup, resolved_env, skip_reason in cases
    ]

def _supported_ngsi_env_vars() -> set:
    """
    The KAFNUS_NGSI_* env vars docker-compose.ngsi.yml actually forwards into
    the kafnus-ngsi container (its `${VAR:-default}`-interpolated entries).
    Used to resolve/validate every scenario's requires_env.json against what
    the harness can actually control -- a var missing here can't be fixed by
    a container recreate, no matter what a scenario's requires_env.json asks
    for (this is the exact class of bug this suite already hit once, when
    KAFNUS_NGSI_ENSURE_TIMEINSTANT was added to kafnus-ngsi but not wired
    into this compose file).
    """
    text = NGSI_COMPOSE_FILE.read_text(encoding="utf-8")
    return set(re.findall(r"\$\{(\w+):-", text))

def _resolve_required_env(dir_path: Path, supported_vars: set) -> tuple:
    """
    Reads a scenario's requires_env.json, if present, and resolves it to the
    FULL set of `supported_vars`, defaulting every flag not mentioned to
    "false" -- kafnus-ngsi's own real default. Returns (resolved_env,
    skip_reason): skip_reason is set only when the file references a var not
    in `supported_vars`, since nothing the harness does can satisfy that.

    Resolving every scenario (not just the ones with a requires_env.json) to
    this same full-dict shape is what lets discover_scenarios() cluster all
    the "nothing special needed" scenarios together by simple dict equality.
    """
    resolved = {var: "false" for var in supported_vars}

    requires_path = dir_path / "requires_env.json"
    if not requires_path.exists():
        return resolved, None

    required = json.loads(requires_path.read_text(encoding="utf-8"))
    unsupported = [var for var in required if var not in supported_vars]
    if unsupported:
        return resolved, (
            f"requires_env.json references {unsupported}, which docker-compose.ngsi.yml does not "
            "forward to the kafnus-ngsi container -- nothing this harness can do about that."
        )

    resolved.update({var: str(value) for var, value in required.items()})
    return resolved, None

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
            deleteEntities=data.get("deleteEntities", []),
            updateSubscription=data.get("updateSubscription", None)
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
