# Copyright (c) HashiCorp, Inc.
# SPDX-License-Identifier: MPL-2.0

FROM docker.mirror.hashicorp.services/jsii/superchain:1-bookworm-slim-node20-nightly@sha256:cd75861281b3f9d503629a87e3529026b588500a752ae60b16c5f226344de2a7

USER root

ARG DEFAULT_TERRAFORM_VERSION
ARG AVAILABLE_TERRAFORM_VERSIONS

RUN apt-get update -y && apt-get install -y unzip jq build-essential time python3-venv wget

RUN python3 -m pip install --break-system-packages pipx "pip>=23.3.1" pipenv
RUN ln -s /usr/bin/python3 /usr/bin/python

RUN npm install -g @sentry/cli --unsafe-perm
# From the official gradle Dockerfile (https://github.com/keeganwitt/docker-gradle/blob/2ba84220e311de7a55f3731509dd772a885b86f8/jdk8/Dockerfile)
ENV GRADLE_HOME /opt/gradle
ENV GRADLE_VERSION 8.2.1
ARG GRADLE_DOWNLOAD_SHA256=03ec176d388f2aa99defcadc3ac6adf8dd2bce5145a129659537c0874dea5ad1
RUN set -o errexit -o nounset \
    && echo "Downloading Gradle" \
    && wget --no-verbose --output-document=gradle.zip "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip" \
    \
    && echo "Checking download hash" \
    && echo "${GRADLE_DOWNLOAD_SHA256} *gradle.zip" | sha256sum --check - \
    \
    && echo "Installing Gradle" \
    && unzip gradle.zip \
    && rm gradle.zip \
    && mv "gradle-${GRADLE_VERSION}" "${GRADLE_HOME}/" \
    && ln --symbolic "${GRADLE_HOME}/bin/gradle" /usr/bin/gradle \
    \
    && echo "Testing Gradle installation" \
    && gradle --version

ENV TF_PLUGIN_CACHE_DIR="/root/.terraform.d/plugin-cache"           \
    # MAVEN_OPTS is set in jsii/superchain with -Xmx512m. This isn't enough memory for provider generation.
    MAVEN_OPTS="-Xms256m -Xmx3G"

# Install Terraform
RUN for VERSION in ${AVAILABLE_TERRAFORM_VERSIONS}; do curl -LOk https://releases.hashicorp.com/terraform/${VERSION}/terraform_${VERSION}_linux_amd64.zip && \
    mkdir -p /usr/local/bin/tf/versions/${VERSION} && \
    unzip terraform_${VERSION}_linux_amd64.zip -d /usr/local/bin/tf/versions/${VERSION} && \
    ln -s /usr/local/bin/tf/versions/${VERSION}/terraform /usr/local/bin/terraform${VERSION};rm terraform_${VERSION}_linux_amd64.zip;done && \
    ln -s /usr/local/bin/tf/versions/${DEFAULT_TERRAFORM_VERSION}/terraform /usr/local/bin/terraform
