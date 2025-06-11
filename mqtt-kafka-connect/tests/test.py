from common_test import multiservice_stack, ServiceOperations
from historic_sink_genrator import entry_one_entity, expected_one_entity




def test_orion_operations(multiservice_stack):
    #  Given
    generated_data = entry_one_entity
    service_operations = ServiceOperations(multiservice_stack, generated_data)
    service_operations.subscribe_to_kafka_topics()
    service_operations.orion_set_up()
    result_kafka = service_operations.check_messages_on_kafka()
    assert all(elem in result_kafka for elem in expected_one_entity)

    #assert expected_one_entity == result_kafka

