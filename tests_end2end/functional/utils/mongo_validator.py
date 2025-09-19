from pymongo import MongoClient
from config import logger

class MongoValidator:
    def __init__(self, uri="mongodb://localhost:27017", db_name="sth_test"):
        self.client = MongoClient(uri)
        self.db = self.client[db_name]

    def validate(self, collection, expected_docs):
        col = self.db[collection]
        for doc in expected_docs:
            # Remove fields that are not predictable
            doc = {k: v for k, v in doc.items() if k not in ("recvtime", "recvtimeTS")}
            if not col.find_one(doc):
                logger.error(f"❌ Expected document not found in {collection}: {doc}")
                return False
        return True

    def validate_absent(self, collection, forbidden_docs):
        col = self.db[collection]
        for doc in forbidden_docs:
            # Remove fields that are not predictable
            doc = {k: v for k, v in doc.items() if k not in ("recvtime", "recvtimeTS")}
            if col.find_one(doc):
                logger.error(f"❌ Forbidden document present in {collection}: {doc}")
                return False
        return True

    def close(self):
        self.client.close()
