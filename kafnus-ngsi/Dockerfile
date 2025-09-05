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

