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

import faust
from app.config import KAFNUS_NGSI_KAFKA_BROKER
from app.config import get_logging_config

app = faust.App(
    'ngsi-processor',
    broker=KAFNUS_NGSI_KAFKA_BROKER,
    value_serializer='raw',
    topic_allow_declare=True,
    logging_config=get_logging_config()
)

# Input Topics for faust (created by service create-topics)
raw_historic_topic = app.topic('raw_historic')
raw_lastdata_topic = app.topic('raw_lastdata')
raw_mutable_topic = app.topic('raw_mutable')
raw_errors_topic = app.topic('raw_errors')
mongo_topic = app.topic('raw_mongo')
mongo_output_topic = app.topic('tests_mongo')
