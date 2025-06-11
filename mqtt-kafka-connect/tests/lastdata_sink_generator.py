from streetlight import Streetlight
from common_test import OrionRequestData
from wasteContainer import WasteContainer

@dataclass
class OrionRequestData:
    """Orion request data"""
    service: str
    subservice: str
    entities: list
    subscriptions: dict
    updateEntities: list


alcobendas_streelight_streelight = OrionRequestData(
    service="alcobendas",
    subservice="/streelight",
    entities= Streetlight["entities"],
    subscriptions={Streetlight["subscriptions"]["lastdata"]},
    updateEntities= Streetlight["updateEntities"],
)

alcobendas_dumps_wastecontainer = OrionRequestData(
    service="alcobendas",
    subservice="/dumps",
    entities= WasteContainer["entities"],
    subscriptions={WasteContainer["subscriptions"]["lastdata"]},
    updateEntities= WasteContainer["updateEntities"],
)

jcyl_dumps_wastecontainer = OrionRequestData(
    service="alcobendas",
    subservice="/dumps",
    entities= WasteContainer["entities"],
    subscriptions={WasteContainer["subscriptions"]["lastdata"]},
    updateEntities= WasteContainer["updateEntities"],
)

sink_lastdata = [[alcobendas_streelight_streelight], [alcobendas_streelight_streelight, alcobendas_dumps_wastecontainer], [alcobendas_streelight_streelight, jcyl_dumps_wastecontainer]]
