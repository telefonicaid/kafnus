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


import json
import argparse
import os
from kafka import KafkaProducer
from datetime import datetime, timezone

VALID_FLOWS = {
    "historic": "smc_raw_historic",
    "lastdata": "smc_raw_lastdata",
    "mutable": "smc_raw_mutable",
    "errors": "smc_errors"
}

def send_notification_from_file(file_path, producer, i=0):
    try:
        with open(file_path) as f:
            notification = json.load(f)
    except Exception as e:
        print(f"❌ Error reading '{file_path}': {e}")
        return False

    flow = notification.get("flow", "").lower()
    topic = VALID_FLOWS.get(flow)

    if topic is None:
        print(f"❌ Invalid notification in '{file_path}': unknown flow '{flow}'")
        return False

    # Change timeinstant
    now = datetime.utcnow().replace(tzinfo=timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')

    attributes = notification.get("body", {}).get("attributes", [])
    for attr in attributes:
        if attr.get("attrName") == "timeinstant":
            attr["attrValue"] = now
        if i!=0:
            if attr.get("attrName") == "entityid":
                attr["attrValue"] = "test"+str(i)

    producer.send(topic, value=notification)
    return True

def send_notifications():
    parser = argparse.ArgumentParser(description='Send JSON notifications to Kafka')
    parser.add_argument('path', type=str, help='Directory containing JSON files')
    parser.add_argument('--repeat', type=int, default=1, help='Number of times to repeat the set of files')
    args = parser.parse_args()

    if not os.path.isdir(args.path):
        print(f"❌ '{args.path}' is not a valid directory")
        return

    json_files = sorted(f for f in os.listdir(args.path) if f.endswith(".json"))
    if not json_files:
        print(f"⚠️ No JSON files found in {args.path}")
        return

    producer = KafkaProducer(
        bootstrap_servers='localhost:9092',
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )

    count=1
    for i in range(args.repeat):
        print(f"🔁 Repetition {i+1}/{args.repeat}")
        for filename in json_files:
            file_path = os.path.join(args.path, filename)
            ok = send_notification_from_file(file_path, producer, count)
            count = count +1
            if ok:
                print(f"  ✅ Sent: {filename}")
            else:
                print(f"  ❌ Failed: {filename}")

    producer.flush()
    print("🏁 Finished sending notifications.")

if __name__ == "__main__":
    send_notifications()
