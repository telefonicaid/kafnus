import requests
import json

BASE_URL = "http://localhost:8000"

def test_get_log_level():
    """I should return current log level """
    response = requests.get(f"{BASE_URL}/logLevel")

    assert response.status_code == 200
    data = response.json()
    assert "level" in data  # it should containt level field


def test_set_log_level():
    """It should change log level"""
    new_level = "debug"

    response = requests.post(
        f"{BASE_URL}/logLevel",
        headers={"Content-Type": "application/json"},
        data=json.dumps({"level": new_level})
    )

    assert response.status_code == 200

    data = response.json()
    assert data["ok"] is True
    assert data["level"] == new_level

    # validate with GET
    response_check = requests.get(f"{BASE_URL}/logLevel")
    assert response_check.status_code == 200
    assert response_check.json()["level"] == new_level


def test_metrics_endpoint():
    """It should return Prometheus metrics"""
    response = requests.get(f"{BASE_URL}/metrics")

    assert response.status_code == 200
    assert "messages_processed_total" in response.text
