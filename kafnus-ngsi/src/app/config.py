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

import os

KAFNUS_NGSI_KAFKA_BROKER = os.getenv("KAFNUS_NGSI_KAFKA_BROKER", "kafka://kafka:9092")
KAFNUS_NGSI_METRICS_PORT = int(os.getenv("KAFNUS_NGSI_METRICS_PORT", "8000"))
TIMEZONE = os.getenv("KAFNUS_NGSI_DEFAULT_TZ", "Europe/Madrid")

def get_logging_config():
    """
    Returns a logging configuration dict compatible with Python's logging.config.dictConfig.
    Intended for use with Faust's logging_config parameter.
    """
    level = os.getenv("KAFNUS_NGSI_LOG_LEVEL", "INFO").upper()
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "kafnus_fmt": {
                "format": (
                    "time=%(asctime)s | lvl=%(levelname)s | comp=KAFNUS-NGSI | "
                    "op=%(name)s:%(filename)s[%(lineno)d]:%(funcName)s | msg=%(message)s"
                )
            }
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "kafnus_fmt",
                "level": level,
            }
        },
        "root": {
            "handlers": ["console"],
            "level": level,
        },
    }