#!/bin/bash

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
#
# Authors: 
#  - Álvaro Vega
#  - Gregorio Blázquez

COMPOSE_FILES=(
  -f docker-compose.kafka.yml
  -f docker-compose.ngsi.yml
  -f docker-compose.orion.yml
  # -f docker-compose.monitoring.yml
)

docker compose "${COMPOSE_FILES[@]}" down --volumes --remove-orphans "$@"
# docker compose -f docker-compose.postgis.yml down
