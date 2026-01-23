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


from pymongo import MongoClient
import time

# Mute pymongo logging noise
import logging
logging.getLogger("pymongo").setLevel(logging.WARNING)

from common.config import logger

class MongoValidator:
    def __init__(self, uri="mongodb://localhost:27017", db_name="sth_test"):
        self.client = MongoClient(uri)
        self.db = self.client[db_name]

    def validate(self, collection, expected_docs, timeout=30, poll_interval=1):
        """
        Waits until all expected documents are present in the collection.
        - expected_docs: list of dicts with the fields that must exist (ignores recvtime)
        - timeout: maximum time in seconds to wait
        - poll_interval: interval between queries in seconds
        """
        col = self.db[collection]
        start = time.time()
        # Filter out recvtime from expected docs
        expected_docs_filtered = [
            {k: v for k, v in doc.items() if k != "recvtime"}
            for doc in expected_docs
        ]

        logger.info(f"🔍 Starting validation on collection '{collection}' for {len(expected_docs_filtered)} documents")

        while time.time() - start < timeout:
            all_found = True
            for doc in expected_docs_filtered:
                found_doc = col.find_one(doc)
                if not found_doc:
                    all_found = False
                    logger.debug(f"Document not found yet: {doc}")
                    break
            if all_found:
                logger.info(f"✅ Validation successful: all expected documents found in {collection}")
                return True
            time.sleep(poll_interval)

        logger.error(f"❌ Timeout: Expected documents not found in {collection}")
        return False

    def validate_absent(self, collection, forbidden_docs, timeout=10, poll_interval=1):
        """
        Waits until none of the forbidden documents are present in the collection.
        """
        col = self.db[collection]
        start = time.time()
        forbidden_docs_filtered = [
            {k: v for k, v in doc.items() if k != "recvtime"}
            for doc in forbidden_docs
        ]

        logger.info(f"🔍 Starting validation_absent on collection '{collection}'")

        while time.time() - start < timeout:
            any_present = False
            for doc in forbidden_docs_filtered:
                found_doc = col.find_one(doc)
                if found_doc:
                    any_present = True
                    logger.debug(f"Forbidden document still present: {doc}")
                    break
            if not any_present:
                logger.info(f"✅ Validation successful: forbidden documents absent in {collection}")
                return True
            time.sleep(poll_interval)

        logger.error(f"❌ Timeout: Forbidden documents still present in {collection}")
        return False

    def close(self):
        self.client.close()
