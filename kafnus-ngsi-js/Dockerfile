ARG NODE_VERSION=18-slim
FROM node:${NODE_VERSION}
ARG GITHUB_ACCOUNT=telefonicaid
ARG GITHUB_REPOSITORY=kafnus
ARG DOWNLOAD=latest
ARG SOURCE_BRANCH=main

# Copying Build time arguments to environment variables so they are persisted at run time and can be 
# inspected within a running container.
# see: https://vsupalov.com/docker-build-time-env-values/  for a deeper explanation.

ENV GITHUB_ACCOUNT=${GITHUB_ACCOUNT}
ENV GITHUB_REPOSITORY=${GITHUB_REPOSITORY}
ENV DOWNLOAD=${DOWNLOAD}


#
# The following RUN command retrieves the source code from GitHub.
# 
# To obtain the latest stable release run this Docker file with the parameters
# --no-cache --build-arg DOWNLOAD=stable
# To obtain any speciifc version of a release run this Docker file with the parameters
# --no-cache --build-arg DOWNLOAD=1.7.0
#
# The default download is the latest tip of the master of the named repository on GitHub
#
# Alternatively for local development, just copy this Dockerfile into file the root of the repository and 
# replace the whole RUN statement by the following COPY statement in your local source using :
# COPY . /opt/kafnus/kafnus-ngsi-js
#
# hadolint ignore=DL3008,DL4001,DL4006,DL3005
RUN apt-get update && \
      # Install security updates
      apt-get upgrade -y && \
      # Ensure that unzip, wget and curl are installed
      apt-get install -y --no-install-recommends unzip ca-certificates curl wget && \
      if [ "${DOWNLOAD}" = "latest" ] ; \
      then \
              RELEASE="${SOURCE_BRANCH}"; \
              echo "INFO: Building Latest Development from ${SOURCE_BRANCH} branch."; \
      elif [ "${DOWNLOAD}" = "stable" ]; \
      then \
              RELEASE=$(curl -s https://api.github.com/repos/"${GITHUB_ACCOUNT}"/"${GITHUB_REPOSITORY}"/releases/latest | grep 'tag_name' | cut -d\" -f4); \
              echo "INFO: Building Latest Stable Release: ${RELEASE}"; \
      else \
              RELEASE="${DOWNLOAD}"; \
              echo "INFO: Building Release: ${RELEASE}"; \
      fi && \
      RELEASE_CONCAT=$(echo "${RELEASE}" | tr / -); \
      wget --no-check-certificate -O source.zip https://github.com/"${GITHUB_ACCOUNT}"/"${GITHUB_REPOSITORY}"/archive/"${RELEASE}".zip && \
      unzip source.zip && \
      rm source.zip && \
      mv "${GITHUB_REPOSITORY}-${RELEASE_CONCAT}" /opt/kafnus && \
      # Remove unzip and clean apt cache
      apt-get clean && \
      apt-get remove -y unzip && \
      apt-get -y autoremove && \
      rm -rf /var/lib/apt/lists/* 

WORKDIR /opt/kafnus/kafnus-ngsi-js
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

