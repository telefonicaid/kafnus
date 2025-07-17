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
import subprocess
import time

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
TESTS_DIR = CURRENT_DIR

def run_tests():
    for root, dirs, files in sorted(os.walk(TESTS_DIR), key=lambda x: x[0]):
        files = sorted(files)
        # Group by notification and expected
        notifications = [f for f in files if f.endswith("_notification.json")]
        expecteds = [f for f in files if f.endswith("_expected.json")]

        if not notifications or not expecteds:
            continue  # Nothing to do

        print(f"\n🧪 Running tests in: {root}")

        for notif_file in notifications:
            notif_path = os.path.join(root, notif_file)
            print(f"📤 Sending notification: {notif_path}")
            subprocess.run(["python3", "../producer.py", notif_path], check=True)

        # Wait between send and check
        time.sleep(1)

        for expected_file in expecteds:
            expected_path = os.path.join(root, expected_file)
            print(f"🔍 Validating: {expected_path}")
            subprocess.run(["python3", "validate_postgis.py", "--test", expected_path], check=True)

if __name__ == "__main__":
    run_tests()
