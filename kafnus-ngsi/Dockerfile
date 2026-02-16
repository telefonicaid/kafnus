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


ARG NODE_VERSION=24-slim
FROM node:${NODE_VERSION}

COPY . /opt/kafnus/kafnus-ngsi

WORKDIR /opt/kafnus/kafnus-ngsi
# hadolint ignore=DL3008,DL3009,DL3015
RUN \
        # Ensure that Git is installed prior to running npm install.
        # curl is added here (again) because the RUN ... above is usually
        # removed for local testing, and and curl is required for
        # docker health-checks.
        apt-get update && \
        apt-get install -y git curl && \
        echo "INFO: npm install --production..." && \
        npm install --production && \
        # Remove Git and clean apt cache
        apt-get clean && \
        apt-get remove -y git && \
        apt-get -y autoremove

USER node
ENV NODE_ENV=production
ENV LOG_LEVEL=INFO


CMD [ "npm", "start" ]

