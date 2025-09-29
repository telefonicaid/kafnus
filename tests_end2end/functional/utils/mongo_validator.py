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

from pymongo import MongoClient
from config import logger
import time

# Mute pymongo logging noise
import logging
logging.getLogger("pymongo").setLevel(logging.WARNING)

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
