from common_test import multiservice_stack, ServiceOperations


def test_orion_operations(multiservice_stack):
    #  Given
    service_operations = ServiceOperations(multiservice_stack)
    service_operations.subscribe_to_kafka_topics()
    service_operations.orion_set_up()
    service_operations.check_messages_on_kafka()
    # When
    #result = service_operations.orion_set_up()
    # Then
    # result == esperado
    #result.check_messages_on_kafka(expected)
