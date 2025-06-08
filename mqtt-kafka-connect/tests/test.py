from common_test import  multiservice_stack, OrionAdapter, OrionRequestGenerator


def test_orion_operations(multiservice_stack):
    host_orion = multiservice_stack.orionHost
    port_orion = multiservice_stack.orionPort
    consumer =  multiservice_stack.consumer

    topic_name = "raw_historic"
    # Suscribirse al tópico
    consumer.subscribe([topic_name])
    consumer.poll(timeout_ms=1000)  # Poll inicial para asignar particiones
    consumer.seek_to_beginning(*consumer.assignment())

    generador = OrionRequestGenerator().generate()
    orion_adapter = OrionAdapter(host_orion, port_orion, generador)
    orion_adapter.create_subscriptions()
    orion_adapter.create_entities()
    orion_adapter.update_entities()

    #Leer mensajes
    messages = []
    completed = False
    while not completed:  # Esperar hasta 10 segundos
        records = consumer.poll(timeout_ms=100000, max_records=8,  update_offsets=False)
        if records:
            for tp, msgs in records.items():
                for message in msgs:
                    # Procesar headers
                    headers_str = ""
                    if message.headers:
                        headers_str = " | ".join([f"{k}:{v.decode('utf-8') if isinstance(v, bytes) else v}" for k, v in message.headers])

                    # Decodificar el valor del mensaje si es bytes
                    try:
                        message_value = message.value.decode('utf-8') if isinstance(message.value, bytes) else str(
                            message.value)
                        message_with_header = f"{headers_str} | {message_value}" if headers_str else message_value
                        messages.append(message_with_header)
                    except Exception as e:
                        print(f"Error processing message: {e}")
                        continue
        else:
            completed = True

    print(f"Mensajes recibidos: {messages}")
    assert len(messages) > 0, f"No se recibieron mensajes en el tópico {topic_name}"
