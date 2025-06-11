from common_test import OrionRequestData




@dataclass
class OrionRequestData:
    """Orion request data"""
    service: str
    subservice: str
    entities: list
    subscriptions: dict
    updateEntities: list


test_sink_historic = OrionRequestData(
    service="alcobendas",
    subservice="streelight",
    entities=[
        {
            "id": "ENT-LUM-001",
            "type": "Streetlight",
            "TimeInstant": {
                "value": "2019-05-23T05:15:00.000Z",
                "type": "DateTime"
            },
            "location": {
                "value": {
                    "type": "Point",
                    "coordinates": [
                        -0.350062,
                        40.054448
                    ]
                },
                "type": "Point"
            },
            "address": {
                "value": "Calle Honorato Ros, 9. 12230 Argelita, Castellón",
                "type": "Text"
            },
            "illuminanceLevel": {
                "value": 0.5,
                "type": "Number"
            },
            "delay": {
                "value": 5,
                "type": "Number"
            },
            "enableHistoricCommand": {
                "value": True,
                "type": "Boolean"
            }
        },
        {
            "id": "ENT-LUM-002",
            "type": "Streetlight",
            "TimeInstant": {
                "value": "2019-05-23T05:15:00.000Z",
                "type": "DateTime"
            },
            "location": {
                "value": {
                    "type": "Point",
                    "coordinates": [
                        -0.350062,
                        40.054448
                    ]
                },
                "type": "Point"
            },
            "address": {
                "value": "Calle Honorato Ros, 9. 12230 Argelita, Castellón",
                "type": "Text"
            },
            "illuminanceLevel": {
                "value": 0.5,
                "type": "Number"
            },
            "delay": {
                "value": 5,
                "type": "Number"
            },
            "enableHistoricCommand": {
                "value": True,
                "type": "Boolean"
            }
        }
    ],
    subscriptions={
        "Streetlight_historic": {
            "documentation": "Subscripción del flujo historic (tipo FLOW_HISTORIC) en modelo Streetlight",
            "description": "Streetlight:HISTORIC:lighting:historic",
            "status": "active",
            "subject": {
                "entities": [
                    {
                        "idPattern": ".*",
                        "type": "Streetlight"
                    }
                ],
                "condition": {
                    "attrs": [
                        "TimeInstant"
                    ]
                }
            },
            "notification": {
                "mqttCustom": {
                    "url": "mqtt://mosquitto:1883",
                    "topic": "kafnus/${service}${servicePath}/raw_historic"
                },
                "attrs": [
                    "TimeInstant",
                    "location",
                    "address",
                    "illuminanceLevel",
                    "delay",
                    "enableHistoricCommand"
                ]
            }
        }
    },
    updateEntities=[

    ]
)
